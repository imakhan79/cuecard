import { z } from "zod";
import { getClaude, errorResponse, jsonError, MODEL, FALLBACK, REFUSAL_MESSAGE } from "@/lib/ai/claude";
import { PREP_SYSTEM, contextBlock } from "@/lib/ai/prompts";
import { loadInterviewContext, textOf } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";
import { PrepSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const schema = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string" },
          coverage: { type: "string", enum: ["strong", "partial", "missing"] },
          evidence: { type: "string" },
        },
        required: ["requirement", "coverage", "evidence"],
        additionalProperties: false,
      },
    },
    checklist: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "short unique slug" },
          task: { type: "string" },
          category: { type: "string", description: "e.g. Story, Skill, Research, Logistics, Questions to ask" },
        },
        required: ["id", "task", "category"],
        additionalProperties: false,
      },
    },
    likely_topics: { type: "array", items: { type: "string" } },
  },
  required: ["requirements", "checklist", "likely_topics"],
  additionalProperties: false,
};

/** Goals & Prep Checklist: parses the JD against the resume and saves a checklist on the interview. */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");
  const parsed = z.object({ sessionId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Invalid request.");

  const loaded = await loadInterviewContext(supabase, parsed.data.sessionId);
  if (!loaded) return jsonError(404, "not_found", "Interview not found.");
  if (!loaded.context.jobDescription) return jsonError(400, "bad_request", "Add the job description under Details first.");

  try {
    const message = await getClaude()
      .beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: "medium", format: { type: "json_schema", schema } },
          ...FALLBACK,
          system: [
            { type: "text", text: PREP_SYSTEM },
            { type: "text", text: contextBlock(loaded.context), cache_control: { type: "ephemeral" } },
          ],
          messages: [{ role: "user", content: "Build my prep plan for this application." }],
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
    const out = PrepSchema.safeParse(json);
    if (!out.success) return jsonError(502, "unknown", "Claude returned an unexpected format. Please retry.");
    // Make checklist ids unique and stable.
    const prep = { ...out.data, checklist: out.data.checklist.map((c, i) => ({ ...c, id: `${i}-${c.id}`.slice(0, 60) })) };

    const { error } = await supabase
      .from("interview_sessions")
      .update({ prep, prep_checked: [] })
      .eq("id", parsed.data.sessionId);
    if (error) return jsonError(500, "unknown", "Couldn't save the checklist. Please retry.");
    return Response.json({ prep });
  } catch (err) {
    return errorResponse(err);
  }
}
