import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiError } from "./errors";

export const MODEL = "claude-opus-5-5";

/** Server-side fallback: if Opus 5.5 declines for policy reasons, the API retries on its default fallback. */
export const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | null = null;

export class MissingKeyError extends Error {}

export function getClaude() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MissingKeyError("ANTHROPIC_API_KEY is not set on the server.");
  }
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

/** Maps SDK errors to a stable code + human-readable message. Most specific first. */
export function toAiError(err: unknown): { status: number; error: AiError } {
  if (err instanceof MissingKeyError) {
    return {
      status: 500,
      error: {
        code: "invalid_key",
        message: "The server has no Claude API key. Add ANTHROPIC_API_KEY to .env.local and restart.",
      },
    };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return {
      status: 502,
      error: {
        code: "invalid_key",
        message: "Claude rejected the API key. Check ANTHROPIC_API_KEY is correct and active.",
      },
    };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      error: { code: "rate_limit", message: "Too many requests to Claude right now. Wait a moment and retry." },
    };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    // Includes APIConnectionTimeoutError.
    return {
      status: 503,
      error: { code: "network", message: "Couldn't reach Claude. Check the server's internet connection and retry." },
    };
  }
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(err.message)) {
      return {
        status: 402,
        error: {
          code: "invalid_key",
          message: "The Anthropic account behind ANTHROPIC_API_KEY has no credit. Add credit at console.anthropic.com → Plans & Billing, then retry.",
        },
      };
    }
    return { status: 400, error: { code: "bad_request", message: "Claude couldn't process that request. Please retry." } };
  }
  if (err instanceof Anthropic.InternalServerError || (err instanceof Anthropic.APIError && err.status === 529)) {
    return {
      status: 503,
      error: { code: "overloaded", message: "Claude is temporarily overloaded. Retry in a few seconds." },
    };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, error: { code: "unknown", message: `Claude API error (${err.status ?? "?"}).` } };
  }
  console.error(err);
  return { status: 500, error: { code: "unknown", message: "Unexpected server error. Please retry." } };
}

export function errorResponse(err: unknown) {
  const { status, error } = toAiError(err);
  return Response.json({ error }, { status });
}

export function jsonError(status: number, code: AiError["code"], message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export const REFUSAL_MESSAGE =
  "Claude declined to answer this one. Try rephrasing the question.";
