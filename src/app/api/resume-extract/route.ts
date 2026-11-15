import { getClaude, errorResponse, jsonError, MODEL, FALLBACK, REFUSAL_MESSAGE } from "@/lib/ai/claude";
import { textOf } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024;

/** Extracts the text of an uploaded PDF resume, verbatim. (.txt/.md files are read in the browser.) */
export async function POST(req: Request) {
  const { user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "bad_request", "Choose a PDF file.");
  if (file.type !== "application/pdf") return jsonError(400, "bad_request", "Only PDF files can be extracted.");
  if (file.size > MAX_BYTES) return jsonError(400, "bad_request", "PDF must be 10 MB or smaller.");

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const message = await getClaude()
      .beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 32000,
          output_config: { effort: "low" },
          ...FALLBACK,
          messages: [
            {
              role: "user",
              content: [
                { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
                {
                  type: "text",
                  text: "Transcribe this resume to plain text, verbatim. Keep every section, heading, date and bullet. Do not summarize, rephrase, correct or add anything. Output only the resume text.",
                },
              ],
            },
          ],
        },
        { signal: req.signal },
      )
      .finalMessage();

    if (message.stop_reason === "refusal") return jsonError(422, "refused", REFUSAL_MESSAGE);
    const text = textOf(message.content).trim();
    if (!text) return jsonError(422, "bad_request", "No text found in that PDF.");
    return Response.json({ text });
  } catch (err) {
    return errorResponse(err);
  }
}
