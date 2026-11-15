import { z } from "zod";
import { jsonError } from "@/lib/ai/claude";
import { generateJson, llmErrorResponse } from "@/lib/ai/llm";
import { FEEDBACK_SYSTEM, contextBlock } from "@/lib/ai/prompts";
import { loadInterviewContext } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { FeedbackSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  questionId: z.uuid(),
  answer: z.string().trim().min(1).max(20000),
});

export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Write an answer first.");
  const { questionId, answer } = parsed.data;

  const { data: q } = await supabase
    .from("questions")
    .select("id, session_id, question")
    .eq("id", questionId)
    .maybeSingle<{ id: string; session_id: string; question: string }>();
  if (!q) return jsonError(404, "not_found", "Question not found.");

  const loaded = await loadInterviewContext(supabase, q.session_id);
  if (!loaded) return jsonError(404, "not_found", "Interview session not found.");

  try {
    const json = await generateJson({
      system: FEEDBACK_SYSTEM,
      context: contextBlock(loaded.context),
      effort: "medium",
      maxTokens: 16000,
      schema: {
        type: "object",
        properties: {
          score: { type: "integer", description: "1 to 10" },
          summary: { type: "string", description: "One or two sentence overall verdict" },
          strengths: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
          resume_conflicts: {
            type: "array",
            items: { type: "string" },
            description: "Claims in the answer that contradict or go beyond the resume; empty if none",
          },
          improved_answer: { type: "string" },
        },
        required: ["score", "summary", "strengths", "improvements", "resume_conflicts", "improved_answer"],
        additionalProperties: false,
      },
      messages: [
        { role: "user", content: `<question>\n${q.question}\n</question>\n\n<candidate_answer>\n${answer}\n</candidate_answer>` },
      ],
      signal: req.signal,
    });
    const out = FeedbackSchema.safeParse(json);
    if (!out.success) return jsonError(502, "unknown", "The AI returned an unexpected format. Please retry.");
    const fb = { ...out.data, score: Math.min(10, Math.max(1, Math.round(out.data.score))) };

    const { data, error } = await supabase
      .from("answers")
      .insert({ question_id: questionId, user_id: user.id, content: answer, score: fb.score, feedback: fb })
      .select("*")
      .single();
    if (error) return jsonError(500, "unknown", "Couldn't save your answer. Please retry.");
    return Response.json({ answer: data });
  } catch (err) {
    return llmErrorResponse(err);
  }
}
