import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getClaude, toAiError, errorResponse, jsonError, MODEL, FALLBACK, REFUSAL_MESSAGE } from "@/lib/ai/claude";
import { contextBlock, mockInterviewerSystem } from "@/lib/ai/prompts";
import { loadInterviewContext } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import type { MockInterview, MockTurn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ answer: z.string().trim().max(10000).optional() });

function parseTag(text: string): { tag: MockTurn["tag"]; say: string } {
  const nl = text.indexOf("\n");
  const first = (nl === -1 ? text : text.slice(0, nl)).trim().toUpperCase();
  const tag = first.includes("END") ? "END" : first.includes("F") ? "F" : "Q";
  const say = (/^\[?(Q|F|END)\]?$/.test(first) ? (nl === -1 ? "" : text.slice(nl + 1)) : text).trim();
  return { tag, say };
}

const encoder = new TextEncoder();
const line = (obj: unknown) => encoder.encode(JSON.stringify(obj) + "\n");

/**
 * Advances a mock interview by one interviewer turn, streamed as NDJSON:
 *   {"type":"text","text":"..."}  … {"type":"done","end":boolean}  or  {"type":"error",...}
 * The first streamed line of text is the tag ([Q]/[F]/[END]); clients hide it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");
  if (!z.uuid().safeParse(id).success) return jsonError(404, "not_found", "Mock interview not found.");

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "bad_request", "Answer is too long.");

  const { data: mock } = await supabase
    .from("mock_interviews")
    .select("id, session_id, kind, question_count, status, transcript")
    .eq("id", id)
    .maybeSingle<Pick<MockInterview, "id" | "session_id" | "kind" | "question_count" | "status" | "transcript">>();
  if (!mock) return jsonError(404, "not_found", "Mock interview not found.");
  if (mock.status === "completed") return jsonError(409, "bad_request", "This mock interview has finished.");

  const loaded = await loadInterviewContext(supabase, mock.session_id);
  if (!loaded) return jsonError(404, "not_found", "Interview session not found.");

  const transcript: MockTurn[] = Array.isArray(mock.transcript) ? [...mock.transcript] : [];
  const last = transcript[transcript.length - 1];
  const answer = parsed.data.answer;

  if (answer) {
    // Ignore a duplicate submit (e.g. a retry after the answer was already saved).
    if (!(last?.role === "candidate" && last.text === answer)) {
      transcript.push({ role: "candidate", text: answer, at: new Date().toISOString() });
    }
  } else if (last?.role === "interviewer") {
    // Resuming: repeat the interviewer's last turn without calling Claude.
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(line({ type: "text", text: `[${last.tag ?? "Q"}]\n${last.text}` }));
        c.enqueue(line({ type: "done", end: last.tag === "END" }));
        c.close();
      },
    });
    return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
  } else if (last?.role === "candidate") {
    // Previous interviewer turn failed after the answer was saved: generate it now.
  }

  const asked = transcript.filter((t) => t.role === "interviewer" && t.tag === "Q").length;
  const turns = transcript.filter((t) => t.role === "interviewer").length;
  const wrapUp = asked >= mock.question_count || turns >= mock.question_count * 2 + 1;
  const notes = wrapUp
    ? `All ${mock.question_count} main questions have been asked. Close the interview now with [END].`
    : `Main questions asked so far: ${asked} of ${mock.question_count}.${
        transcript.length && transcript[transcript.length - 2]?.tag === "F" ? " You just asked a follow-up, so move on to a new main question." : ""
      }`;

  // Interviewer turns are the assistant; candidate turns are the user.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: "(The candidate has joined the call.)" },
  ];
  for (const t of transcript) {
    if (t.role === "interviewer") messages.push({ role: "assistant", content: `[${t.tag ?? "Q"}]\n${t.text}` });
    else {
      const prev = messages[messages.length - 1];
      if (prev.role === "user") prev.content = `${prev.content}\n\n${t.text}`;
      else messages.push({ role: "user", content: t.text });
    }
  }
  const final = messages[messages.length - 1];
  final.content = `${final.content}\n\n<interviewer_notes>${notes}</interviewer_notes>`;

  let stream;
  let iterator;
  let first;
  try {
    stream = getClaude().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        ...FALLBACK,
        system: [
          { type: "text", text: mockInterviewerSystem(mock.kind, mock.question_count) },
          { type: "text", text: contextBlock(loaded.context), cache_control: { type: "ephemeral" } },
        ],
        messages,
      },
      { signal: req.signal },
    );
    iterator = stream[Symbol.asyncIterator]();
    first = await iterator.next();
  } catch (err) {
    // Still save the candidate's answer so it isn't lost.
    if (answer) await supabase.from("mock_interviews").update({ transcript }).eq("id", id);
    return errorResponse(err);
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        let result = first;
        while (!result.done) {
          const event = result.value;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            controller.enqueue(line({ type: "text", text: event.delta.text }));
          }
          result = await iterator.next();
        }
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") {
          if (answer) await supabase.from("mock_interviews").update({ transcript }).eq("id", id);
          controller.enqueue(line({ type: "error", error: { code: "refused", message: REFUSAL_MESSAGE } }));
          return;
        }
        const { tag, say } = parseTag(text);
        transcript.push({ role: "interviewer", text: say, tag, at: new Date().toISOString() });
        await supabase.from("mock_interviews").update({ transcript }).eq("id", id);
        controller.enqueue(line({ type: "done", end: tag === "END" }));
      } catch (err) {
        if (answer) await supabase.from("mock_interviews").update({ transcript }).eq("id", id);
        if (!req.signal.aborted) controller.enqueue(line({ type: "error", error: toAiError(err).error }));
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
