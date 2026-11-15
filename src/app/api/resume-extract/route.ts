import { jsonError } from "@/lib/ai/claude";
import { generateCompat, llmErrorResponse } from "@/lib/ai/llm";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Extracts resume text from a PDF (via Claude, verbatim) or a Word .docx file. (.txt/.md are read in the browser.) */
export async function POST(req: Request) {
  const { user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "bad_request", "Choose a PDF or Word file.");
  if (file.size > MAX_BYTES) return jsonError(400, "bad_request", "File must be 10 MB or smaller.");
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === DOCX || name.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      const text = value.replace(/\n{3,}/g, "\n\n").trim();
      if (!text) return jsonError(422, "bad_request", "No text found in that Word file.");
      return Response.json({ text });
    } catch {
      return jsonError(422, "bad_request", "Couldn't read that Word file. Try saving it as PDF.");
    }
  }

  if (file.type !== "application/pdf" && !name.endsWith(".pdf")) {
    return jsonError(400, "bad_request", "Upload a PDF, Word (.docx), .txt or .md file.");
  }

  try {
    const message = await generateCompat(
        {
          max_tokens: 32000,
          output_config: { effort: "low" },
          messages: [
            {
              role: "user",
              content: [
                { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
                {
                  type: "text",
                  text: "Transcribe this resume to plain text, verbatim. Keep every section, heading, date and bullet. Do not summarize, rephrase, correct or add anything. Output only the resume text.",
                },
              ],
            },
          ],
        },
        { signal: req.signal },
      );
    const text = message.trim();
    if (!text) return jsonError(422, "bad_request", "No text found in that PDF.");
    return Response.json({ text });
  } catch (err) {
    return llmErrorResponse(err);
  }
}
