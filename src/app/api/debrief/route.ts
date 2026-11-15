import { z } from "zod";
import { getClaude, errorResponse, jsonError, MODEL, FALLBACK, REFUSAL_MESSAGE } from "@/lib/ai/claude";
import { DEBRIEF_SYSTEM, contextBlock } from "@/lib/ai/prompts";
import { loadInterviewContext, textOf } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { DebriefSchema, type MockReport } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const Body = z.object({
  sessionId: z.uuid(),
  source: z.enum(["live", "practice"]),
  /** Live only: the interviewer transcript from this call (not stored otherwise). */
  transcript: z.string().max(40000).optional(),
});

const schema = {
  type: "object",
  properties: {
    readiness: { type: "integer", description: "1 to 10" },
    summary: { type: "string", description: "2-3 sentences, plain language" },
    worked: { type: "array", items: { type: "string" } },
    weak_spots: { type: "array", items: { type: "string" }, description: "Concrete, testable skills/topics to fix" },
    next_steps: { type: "array", items: { type: "string" } },
    questions_seen: { type: "array", items: { type: "string" }, description: "Interview questions covered in this session" },
  },
  required: ["readiness", "summary", "worked", "weak_spots", "next_steps", "questions_seen"],
  additionalProperties: false,
};

/** Interview Debrief: plain-language readiness report after a live or practice session. */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Invalid request.");
  const { sessionId, source, transcript } = parsed.data;

  const loaded = await loadInterviewContext(supabase, sessionId);
  if (!loaded) return jsonError(404, "not_found", "Interview not found.");

  const [{ data: questions }, { data: mocks }] = await Promise.all([
    supabase
      .from("questions")
      .select("source, question, created_at, answers(score, feedback)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("mock_interviews")
      .select("kind, overall_score, report")
      .eq("session_id", sessionId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const evidence: string[] = [];
  for (const q of questions ?? []) {
    const answers = (q.answers ?? []) as { score: number | null; feedback: { improvements?: string[] } | null }[];
    const scores = answers.map((a) => a.score).filter(Boolean);
    evidence.push(
      `- [${q.source}] ${q.question}${scores.length ? ` (practice scores: ${scores.join(", ")})` : ""}${
        answers[0]?.feedback?.improvements?.length ? `; to improve: ${answers[0].feedback.improvements.slice(0, 2).join("; ")}` : ""
      }`,
    );
  }
  for (const m of mocks ?? []) {
    const r = m.report as MockReport | null;
    evidence.push(`- Mock (${m.kind}) score ${m.overall_score}/10. Improvements: ${(r?.improvements ?? []).slice(0, 3).join("; ")}`);
  }
  if (!evidence.length && !transcript?.trim()) {
    return jsonError(400, "bad_request", "Nothing to debrief yet. Answer some questions or run the copilot first.");
  }

  try {
    const message = await getClaude()
      .beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: "medium", format: { type: "json_schema", schema } },
          ...FALLBACK,
          system: [
            { type: "text", text: DEBRIEF_SYSTEM },
            { type: "text", text: contextBlock(loaded.context), cache_control: { type: "ephemeral" } },
          ],
          messages: [
            {
              role: "user",
              content: `Session type: ${source}.\n\n<evidence>\n${evidence.join("\n") || "(none)"}\n</evidence>${
                transcript ? `\n\n<live_interviewer_transcript>\n${transcript}\n</live_interviewer_transcript>` : ""
              }\n\nWrite the debrief.`,
            },
          ],
        },
        { signal: req.signal },
      )
      .finalMessage();
    if (message.stop_reason === "refusal") return jsonError(422, "refused", REFUSAL_MESSAGE);

    let json: unknown = null;
    try {
      json = JSON.parse(textOf(message.content));
    } catch {
      // handled below
    }
    const out = DebriefSchema.safeParse(json);
    if (!out.success) return jsonError(502, "unknown", "Claude returned an unexpected format. Please retry.");
    const report = { ...out.data, readiness: Math.min(10, Math.max(1, Math.round(out.data.readiness))) };

    const { data, error } = await supabase
      .from("debriefs")
      .insert({ session_id: sessionId, user_id: user.id, source, readiness: report.readiness, report })
      .select("id, source, readiness, report, created_at")
      .single();
    if (error) return jsonError(500, "unknown", "Couldn't save the debrief. Please retry.");
    return Response.json({ debrief: data });
  } catch (err) {
    return errorResponse(err);
  }
}
