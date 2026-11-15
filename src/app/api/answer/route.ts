import { z } from "zod";
import {
  getClaude,
  toAiError,
  errorResponse,
  jsonError,
  MODEL,
  FALLBACK,
  REFUSAL_MESSAGE,
} from "@/lib/ai/claude";
import { COPILOT_SYSTEM, LIVE_ANSWER_SYSTEM, contextBlock } from "@/lib/ai/prompts";
import { loadInterviewContext } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.union([
  z.object({
    mode: z.literal("question").default("question"),
    sessionId: z.uuid(),
    question: z.string().trim().min(1).max(5000),
    /** When answering an existing (practice) question, update it instead of inserting a new one. */
    questionId: z.uuid().optional(),
  }),
  z.object({
    /** Copilot: Claude finds the latest question in a live meeting transcript and answers it. */
    mode: z.literal("copilot"),
    sessionId: z.uuid(),
    transcript: z.string().trim().min(1).max(20000),
  }),
]);

/** Splits Claude's copilot output into the detected question and the answer. */
function splitCopilot(text: string) {
  const nl = text.indexOf("\n");
  const first = (nl === -1 ? text : text.slice(0, nl)).trim();
  const question = first.replace(/^Q:\s*/i, "").trim();
  return { question, answer: nl === -1 ? "" : text.slice(nl + 1).trim(), none: /^none\.?$/i.test(question) };
}

/**
 * Streams a suggested answer as NDJSON lines:
 *   {"type":"text","text":"..."}            (many)
 *   {"type":"done","questionId":"..."}      (on success)
 *   {"type":"error","error":{code,message}} (if something fails mid-stream)
 * Errors before streaming starts come back as JSON with a non-2xx status.
 */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Please enter a question.");
  const input = parsed.data;
  const { sessionId } = input;
  const copilot = input.mode === "copilot";
  const questionId = input.mode === "copilot" ? undefined : input.questionId;

  const loaded = await loadInterviewContext(supabase, sessionId);
  if (!loaded) return jsonError(404, "not_found", "Interview session not found.");

  let stream;
  let iterator;
  let first;
  try {
    stream = getClaude().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 8000,
        output_config: { effort: "low" },
        ...FALLBACK,
        system: [
          { type: "text", text: copilot ? COPILOT_SYSTEM : LIVE_ANSWER_SYSTEM },
          // Resume + job description stay the same for a whole session, so cache them.
          { type: "text", text: contextBlock(loaded.context), cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content:
              input.mode === "copilot"
                ? `<meeting_transcript>\n${input.transcript}\n</meeting_transcript>\n\nAnswer the interviewer's latest question.`
                : `Interview question:\n${input.question}`,
          },
        ],
      },
      { signal: req.signal },
    );
    iterator = stream[Symbol.asyncIterator]();
    // Wait for the first event so key / rate-limit / network errors become a proper HTTP error.
    first = await iterator.next();
  } catch (err) {
    return errorResponse(err);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let answer = "";
      try {
        let result = first;
        while (!result.done) {
          const event = result.value;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            answer += event.delta.text;
            send({ type: "text", text: event.delta.text });
          }
          result = await iterator.next();
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          send({ type: "error", error: { code: "refused", message: REFUSAL_MESSAGE } });
          return;
        }

        let savedId: string | null = questionId ?? null;
        let question = input.mode === "copilot" ? "" : input.question;
        if (copilot) {
          const split = splitCopilot(answer);
          if (split.none || !split.answer) {
            send({ type: "done", questionId: null, none: true });
            return;
          }
          question = split.question;
          answer = split.answer;
        }
        if (questionId) {
          await supabase.from("questions").update({ suggested_answer: answer }).eq("id", questionId);
        } else {
          const { data } = await supabase
            .from("questions")
            .insert({
              session_id: sessionId,
              user_id: user.id,
              source: copilot ? "copilot" : "live",
              question: question.slice(0, 5000),
              suggested_answer: answer,
            })
            .select("id")
            .single();
          savedId = data?.id ?? null;
        }
        send({ type: "done", questionId: savedId });
      } catch (err) {
        if (!req.signal.aborted) send({ type: "error", error: toAiError(err).error });
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
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
