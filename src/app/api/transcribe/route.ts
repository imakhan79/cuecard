import { jsonError } from "@/lib/ai/claude";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Transcribes one short audio clip (an utterance cut at a pause) from the meeting.
 * Uses Deepgram if DEEPGRAM_API_KEY is set, otherwise OpenAI if OPENAI_API_KEY is set.
 * (Claude doesn't take audio input, so speech-to-text needs a dedicated service.)
 */
export async function POST(req: Request) {
  const { user } = await getUser();
  if (!user) return jsonError(401, "unauthorized", "Please sign in again.");

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return jsonError(400, "bad_request", "No audio received.");
  if (audio.size > MAX_BYTES) return jsonError(400, "bad_request", "Audio clip too large.");
  const lang = String(form?.get("lang") || "auto").slice(0, 10);

  const deepgram = process.env.DEEPGRAM_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;

  if (!deepgram && !openai && gemini) {
    // Google's dedicated speech-to-text model. Unlike general Gemini models it returns
    // nothing for silence/noise instead of inventing words, which matters here: an
    // invented sentence would become a fake interviewer question.
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": gemini },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: (audio.type || "audio/wav").split(";")[0], data: Buffer.from(await audio.arrayBuffer()).toString("base64") } },
                ],
              },
            ],
          }),
          signal: req.signal,
        },
      );
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return jsonError(502, "invalid_key", "The Gemini API key was rejected. Check GEMINI_API_KEY.");
      }
      if (res.status === 429) return jsonError(429, "rate_limit", "Transcription rate limit reached. Retrying shortly.");
      if (!res.ok) return jsonError(502, "unknown", `Transcription failed (${res.status}).`);
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; audioTranscription?: { text?: string } }[] } }[];
      };
      const text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.audioTranscription?.text ?? p.text ?? "").join(" ") ?? "";
      return Response.json({ text: text.trim() });
    } catch (err) {
      if ((err as Error).name === "AbortError") return jsonError(499, "network", "Cancelled.");
      return jsonError(503, "network", "Couldn't reach the transcription service.");
    }
  }

  if (!deepgram && !openai) {
    return jsonError(
      500,
      "invalid_key",
      "Meeting-audio transcription isn't configured. Add DEEPGRAM_API_KEY (or OPENAI_API_KEY) on the server, or switch the copilot to Microphone mode.",
    );
  }

  try {
    let res: Response;
    if (deepgram) {
      const url = new URL("https://api.deepgram.com/v1/listen");
      url.searchParams.set("model", "nova-3");
      url.searchParams.set("smart_format", "true");
      // Auto-detect the spoken language (Deepgram supports 30+; set lang to force one).
      if (lang === "auto") url.searchParams.set("detect_language", "true");
      else url.searchParams.set("language", lang.split("-")[0] || "en");
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Token ${deepgram}`, "Content-Type": audio.type || "audio/webm" },
        body: Buffer.from(await audio.arrayBuffer()),
        signal: req.signal,
      });
    } else {
      const body = new FormData();
      body.append("file", audio, "clip.webm");
      body.append("model", "gpt-4o-mini-transcribe");
      if (lang !== "auto") body.append("language", lang.split("-")[0] || "en");
      res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openai}` },
        body,
        signal: req.signal,
      });
    }

    if (res.status === 401 || res.status === 403) {
      return jsonError(502, "invalid_key", "The transcription API key was rejected. Check DEEPGRAM_API_KEY / OPENAI_API_KEY.");
    }
    if (res.status === 429) return jsonError(429, "rate_limit", "Transcription rate limit reached. Retrying shortly.");
    if (!res.ok) return jsonError(502, "unknown", `Transcription failed (${res.status}).`);

    const data = (await res.json()) as {
      text?: string;
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    const text = (deepgram ? data.results?.channels?.[0]?.alternatives?.[0]?.transcript : data.text) ?? "";
    return Response.json({ text: text.trim() });
  } catch (err) {
    if ((err as Error).name === "AbortError") return jsonError(499, "network", "Cancelled.");
    return jsonError(503, "network", "Couldn't reach the transcription service.");
  }
}
