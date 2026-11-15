import { getClaude, jsonError, MODEL, FALLBACK } from "@/lib/ai/claude";
import { ndjsonResponse } from "@/lib/ai/ndjson";
import { SCREEN_HELP_SYSTEM, contextBlock } from "@/lib/ai/prompts";
import { loadInterviewContext } from "@/lib/data";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Screen Help: reads a screenshot (coding problem, diagram, error…) and streams a solution. */
export async function POST(req: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");

  const form = await req.formData().catch(() => null);
  const image = form?.get("image");
  const sessionId = String(form?.get("sessionId") ?? "");
  const note = String(form?.get("note") ?? "").slice(0, 1000);
  if (!(image instanceof File) || !image.size) return jsonError(400, "bad_request", "No screenshot received.");
  if (image.size > MAX_BYTES) return jsonError(400, "bad_request", "Screenshot too large.");
  const mediaType = TYPES.find((t) => t === image.type);
  if (!mediaType) return jsonError(400, "bad_request", "Screenshot must be JPEG, PNG or WebP.");

  const loaded = sessionId ? await loadInterviewContext(supabase, sessionId) : null;
  const data = Buffer.from(await image.arrayBuffer()).toString("base64");

  return ndjsonResponse(req, () =>
    getClaude().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        ...FALLBACK,
        system: [
          { type: "text", text: SCREEN_HELP_SYSTEM },
          ...(loaded ? [{ type: "text" as const, text: contextBlock(loaded.context), cache_control: { type: "ephemeral" as const } }] : []),
        ],
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: note ? `Help with what's on my screen. Note: ${note}` : "Help with what's on my screen." },
            ],
          },
        ],
      },
      { signal: req.signal },
    ),
  );
}
