import { z } from "zod";
import { getClaude, errorResponse, jsonError, MODEL, FALLBACK, REFUSAL_MESSAGE } from "@/lib/ai/claude";
import { MOCK_REPORT_SYSTEM, contextBlock } from "@/lib/ai/prompts";
import { loadInterviewContext, textOf } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { MockReportSchema, type MockInterview } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = {
  type: "object",
  properties: {
    overall_score: { type: "integer", description: "1 to 10" },
    hire_signal: { type: "string", enum: ["strong_yes", "yes", "lean_no", "no"] },
    summary: { type: "string", description: "2-3 sentence overall verdict" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    communication: { type: "string", description: "Delivery: structure, conciseness, confidence, filler" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          score: { type: "integer", description: "1 to 10" },
          feedback: { type: "string" },
          model_answer: { type: "string" },
        },
        required: ["question", "score", "feedback", "model_answer"],
        additionalProperties: false,
      },
    },
  },
  required: ["overall_score", "hire_signal", "summary", "strengths", "improvements", "communication", "questions"],
  additionalProperties: false,
};

/** Ends a mock interview and writes the scored debrief. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");
  if (!z.uuid().safeParse(id).success) return jsonError(404, "not_found", "Mock interview not found.");

  const { data: mock } = await supabase
    .from("mock_interviews")
    .select("id, session_id, kind, question_count, status, transcript, report")
    .eq("id", id)
    .maybeSingle<MockInterview>();
  if (!mock) return jsonError(404, "not_found", "Mock interview not found.");
  if (mock.report) return Response.json({ report: mock.report });

  const answers = (mock.transcript ?? []).filter((t) => t.role === "candidate");
  if (!answers.length) return jsonError(400, "bad_request", "Answer at least one question to get a report.");

  const loaded = await loadInterviewContext(supabase, mock.session_id);
  if (!loaded) return jsonError(404, "not_found", "Interview session not found.");

  const transcript = mock.transcript
    .map((t) => `${t.role === "interviewer" ? `Interviewer${t.tag === "F" ? " (follow-up)" : ""}` : "Candidate"}: ${t.text}`)
    .join("\n\n");

  try {
    const message = await getClaude()
      .beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: "medium", format: { type: "json_schema", schema } },
          ...FALLBACK,
          system: [
            { type: "text", text: MOCK_REPORT_SYSTEM },
            { type: "text", text: contextBlock(loaded.context), cache_control: { type: "ephemeral" } },
          ],
          messages: [
            {
              role: "user",
              content: `Mock interview type: ${mock.kind}. Planned main questions: ${mock.question_count}.\n\n<interview_transcript>\n${transcript}\n</interview_transcript>\n\nWrite the debrief. Score only the main questions the candidate actually answered (fold follow-ups into their main question).`,
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
    const out = MockReportSchema.safeParse(json);
    if (!out.success) return jsonError(502, "unknown", "Claude returned an unexpected format. Please retry.");
    const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));
    const report = {
      ...out.data,
      overall_score: clamp(out.data.overall_score),
      questions: out.data.questions.map((q) => ({ ...q, score: clamp(q.score) })),
    };

    const { error } = await supabase
      .from("mock_interviews")
      .update({ report, overall_score: report.overall_score, status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return jsonError(500, "unknown", "Couldn't save the report. Please retry.");

    return Response.json({ report });
  } catch (err) {
    return errorResponse(err);
  }
}
