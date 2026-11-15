import { z } from "zod";
import { jsonError } from "@/lib/ai/claude";
import { ndjsonResponse } from "@/lib/ai/ndjson";
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
    /** Private mode: don't save the detected question or answer. */
    save: z.boolean().default(true),
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

  return ndjsonResponse(
    req,
    {
      system: copilot ? COPILOT_SYSTEM : LIVE_ANSWER_SYSTEM,
      // Resume + job description stay the same for a whole session, so they're cached.
      context: contextBlock(loaded.context),
      effort: "low",
      maxTokens: 8000,
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
    async (full) => {
      let answer = full;
      let question = input.mode === "copilot" ? "" : input.question;
      if (input.mode === "copilot") {
        const split = splitCopilot(full);
        if (split.none || !split.answer) return { questionId: null, none: true };
        question = split.question;
        answer = split.answer;
        if (!input.save) return { questionId: null, private: true };
      }
      if (questionId) {
        await supabase.from("questions").update({ suggested_answer: answer }).eq("id", questionId);
        return { questionId };
      }
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
      return { questionId: data?.id ?? null };
    },
  );
}
