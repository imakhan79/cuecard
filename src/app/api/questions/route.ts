import { z } from "zod";
import { jsonError } from "@/lib/ai/claude";
import { generateJson, llmErrorResponse } from "@/lib/ai/llm";
import { QUESTIONS_SYSTEM, contextBlock } from "@/lib/ai/prompts";
import { loadInterviewContext } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  sessionId: z.uuid(),
  count: z.number().int().min(1).max(10).default(5),
});

const Output = z.object({ questions: z.array(z.string().min(1)).min(1) });

export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Invalid request.");
  const { sessionId, count } = parsed.data;

  const loaded = await loadInterviewContext(supabase, sessionId);
  if (!loaded) return jsonError(404, "not_found", "Interview session not found.");

  const { data: existing } = await supabase.from("questions").select("question").eq("session_id", sessionId).limit(50);
  const avoid = (existing ?? []).map((q) => `- ${q.question}`).join("\n");

  try {
    const json = await generateJson({
      system: QUESTIONS_SYSTEM,
      context: contextBlock(loaded.context),
      effort: "medium",
      maxTokens: 16000,
      schema: {
        type: "object",
        properties: { questions: { type: "array", items: { type: "string" } } },
        required: ["questions"],
        additionalProperties: false,
      },
      messages: [
        { role: "user", content: `Generate ${count} interview questions.${avoid ? `\nDo not repeat these:\n${avoid}` : ""}` },
      ],
      signal: req.signal,
    });
    const out = Output.safeParse(json);
    if (!out.success) return jsonError(502, "unknown", "The AI returned an unexpected format. Please retry.");

    const rows = out.data.questions.slice(0, count).map((question) => ({
      session_id: sessionId,
      user_id: user.id,
      source: "practice" as const,
      question: question.slice(0, 5000),
    }));
    const { data, error } = await supabase.from("questions").insert(rows).select("*");
    if (error) return jsonError(500, "unknown", "Couldn't save the questions. Please retry.");
    return Response.json({ questions: data });
  } catch (err) {
    return llmErrorResponse(err);
  }
}
