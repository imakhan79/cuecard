import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { FALLBACK, MODEL, MissingKeyError, getClaude, toAiError } from "./claude";
import type { AiError } from "./errors";
import { geminiKeys, geminiPost } from "./gemini";

/**
 * Provider-neutral text generation. Claude (claude-opus-5-5) is the primary model.
 * If Claude can't serve a request — no API key, no credit, invalid key, rate limit,
 * outage or network failure — and GEMINI_API_KEY is set, the same request is sent to
 * Google Gemini instead. Set AI_PROVIDER=gemini to use Gemini only, or AI_PROVIDER=claude
 * to disable the fallback.
 */

export type Part =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }
  | { type: "pdf"; data: string };

export type Msg = { role: "user" | "assistant"; content: string | Part[] };

export type LlmRequest = {
  system: string;
  /** Large, stable context (resume + job description). Cached on Claude. */
  context?: string;
  messages: Msg[];
  effort: "low" | "medium";
  maxTokens: number;
  /** JSON schema for structured output (generateJson only). */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
};

/** A Gemini/provider error already mapped to the app's error shape. */
export class LlmError extends Error {
  constructor(
    public status: number,
    public error: AiError,
  ) {
    super(error.message);
  }
}

/** Thrown when the model declines (policy refusal / safety block). */
export class RefusedError extends Error {}

// Tried in order; each model has its own free-tier quota per key.
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

function provider(): "claude" | "gemini" | "auto" {
  const p = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  return p === "claude" || p === "gemini" ? p : "auto";
}

const hasGemini = () => geminiKeys().length > 0;

/** Claude failures that Gemini can cover. Bad requests (our bug) and refusals are not retried. */
function shouldFallBack(err: unknown) {
  if (provider() !== "auto" || !hasGemini()) return false;
  if (err instanceof MissingKeyError) return true;
  const code = toAiError(err).error.code;
  return code === "invalid_key" || code === "rate_limit" || code === "overloaded" || code === "network";
}

/* ------------------------------------------------------------------ */
/* Claude                                                              */
/* ------------------------------------------------------------------ */

function claudeContent(content: Msg["content"]): Anthropic.Beta.Messages.BetaContentBlockParam[] | string {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text"
      ? { type: "text" as const, text: p.text }
      : p.type === "image"
        ? { type: "image" as const, source: { type: "base64" as const, media_type: p.mediaType, data: p.data } }
        : { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: p.data } },
  );
}

function claudeParams(req: LlmRequest) {
  return {
    model: MODEL,
    max_tokens: req.maxTokens,
    output_config: {
      effort: req.effort,
      ...(req.schema ? { format: { type: "json_schema" as const, schema: req.schema } } : {}),
    },
    ...FALLBACK,
    system: [
      { type: "text" as const, text: req.system },
      ...(req.context ? [{ type: "text" as const, text: req.context, cache_control: { type: "ephemeral" as const } }] : []),
    ],
    messages: req.messages.map((m) => ({ role: m.role, content: claudeContent(m.content) })),
  };
}

async function* claudeStream(req: LlmRequest): AsyncGenerator<string, void> {
  const stream = getClaude().beta.messages.stream(claudeParams(req), { signal: req.signal });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  }
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new RefusedError();
}

/* ------------------------------------------------------------------ */
/* Gemini                                                              */
/* ------------------------------------------------------------------ */

function geminiBody(req: LlmRequest) {
  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = [];
  for (const m of req.messages) {
    const parts =
      typeof m.content === "string"
        ? [{ text: m.content }]
        : m.content.map((p) =>
            p.type === "text"
              ? { text: p.text }
              : { inline_data: { mime_type: p.type === "pdf" ? "application/pdf" : p.mediaType, data: p.data } },
          );
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last?.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }
  return {
    systemInstruction: { parts: [{ text: req.context ? `${req.system}\n\n${req.context}` : req.system }] },
    contents,
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      thinkingConfig: { thinkingLevel: req.effort },
      ...(req.schema ? { responseMimeType: "application/json", responseJsonSchema: req.schema } : {}),
    },
  };
}

async function geminiFetch(req: LlmRequest, method: "generateContent" | "streamGenerateContent") {
  if (!hasGemini()) throw new LlmError(500, { code: "invalid_key", message: "No AI provider is configured on the server." });
  let res: Response;
  try {
    // Rotates across every Gemini key and model so one free-tier quota running out doesn't stop the app.
    res = await geminiPost(
      // Live/low-effort answers: Flash-Lite first (≈1s to first words), Flash as backup.
      req.effort === "low" ? [...GEMINI_MODELS].reverse() : GEMINI_MODELS,
      method,
      geminiBody(req),
      req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
      method === "streamGenerateContent" ? "?alt=sse" : "",
    );
  } catch (e) {
    if (req.signal?.aborted) throw e;
    throw new LlmError(503, { code: "network", message: "Couldn't reach the AI service. Please retry." });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403 || /API key/i.test(body)) {
      throw new LlmError(502, { code: "invalid_key", message: "The Gemini API key was rejected. Check GEMINI_API_KEY." });
    }
    if (res.status === 429) {
      throw new LlmError(429, { code: "rate_limit", message: "AI rate limit reached (Gemini free tier). Wait a moment and retry." });
    }
    if (res.status >= 500) throw new LlmError(503, { code: "overloaded", message: "The AI service is busy. Retry in a few seconds." });
    throw new LlmError(400, { code: "bad_request", message: "The AI couldn't process that request. Please retry." });
  }
  return res;
}

type GeminiChunk = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

function chunkText(c: GeminiChunk) {
  if (c.promptFeedback?.blockReason) throw new RefusedError();
  const cand = c.candidates?.[0];
  if (cand?.finishReason && BLOCKED.has(cand.finishReason)) throw new RefusedError();
  return (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
}

async function* geminiStream(req: LlmRequest): AsyncGenerator<string, void> {
  const res = await geminiFetch(req, "streamGenerateContent");
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const text = chunkText(JSON.parse(line.slice(5)) as GeminiChunk);
      if (text) yield text;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type TextStream = { first: IteratorResult<string, void>; rest: AsyncGenerator<string, void>; provider: "claude" | "gemini" };

/**
 * Starts a streamed generation and waits for the first chunk, so key / credit / rate-limit /
 * network problems surface as an exception (and can fall back) before anything is sent.
 */
export async function startTextStream(req: LlmRequest): Promise<TextStream> {
  if (provider() !== "gemini") {
    try {
      const rest = claudeStream(req);
      return { first: await rest.next(), rest, provider: "claude" };
    } catch (err) {
      if (!shouldFallBack(err)) throw err;
    }
  }
  const rest = geminiStream(req);
  return { first: await rest.next(), rest, provider: "gemini" };
}

/** Full text (non-streamed to the client). */
export async function generateText(req: LlmRequest): Promise<string> {
  const s = await startTextStream(req);
  let text = s.first.done ? "" : s.first.value;
  for await (const chunk of s.rest) text += chunk;
  return text;
}

/** Structured JSON output matching `req.schema`. */
export async function generateJson(req: LlmRequest): Promise<unknown> {
  const text = await generateText(req);
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
}

/** Maps any provider error to { status, error } for API responses. */
export function llmError(err: unknown): { status: number; error: AiError } {
  if (err instanceof LlmError) return { status: err.status, error: err.error };
  if (err instanceof RefusedError) {
    return { status: 422, error: { code: "refused", message: "The AI declined to answer this one. Try rephrasing." } };
  }
  return toAiError(err);
}

export function llmErrorResponse(err: unknown) {
  const { status, error } = llmError(err);
  return Response.json({ error }, { status });
}

/* ------------------------------------------------------------------ */
/* Adapter for routes written against Claude's request shape           */
/* ------------------------------------------------------------------ */

type ClaudeShaped = {
  max_tokens: number;
  output_config?: { effort?: string; format?: { type: "json_schema"; schema: Record<string, unknown> } };
  system?: { type: "text"; text: string; cache_control?: unknown }[];
  messages: {
    role: "user" | "assistant";
    content:
      | string
      | (
          | { type: "text"; text: string }
          | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
          | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
        )[];
  }[];
  [key: string]: unknown;
};

/** Runs a Claude-shaped request through the provider layer (Claude, falling back to Gemini). Returns the text. */
export function generateCompat(params: ClaudeShaped, opts?: { signal?: AbortSignal }): Promise<string> {
  const [system, context] = [params.system?.[0]?.text ?? "", params.system?.[1]?.text];
  return generateText({
    system,
    context,
    effort: params.output_config?.effort === "low" ? "low" : "medium",
    maxTokens: params.max_tokens,
    schema: params.output_config?.format?.schema,
    signal: opts?.signal,
    messages: params.messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === "string"
          ? m.content
          : m.content.map((b): Part =>
              b.type === "text"
                ? { type: "text", text: b.text }
                : b.type === "image"
                  ? { type: "image", mediaType: b.source.media_type as "image/jpeg", data: b.source.data }
                  : { type: "pdf", data: b.source.data },
            ),
    })),
  });
}
