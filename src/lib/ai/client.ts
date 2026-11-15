"use client";

import type { AiError } from "./errors";

export class AiRequestError extends Error {
  constructor(public error: AiError) {
    super(error.message);
  }
}

function networkError(): AiRequestError {
  return new AiRequestError({
    code: "network",
    message: "Couldn't reach the Cuecard server. Check your connection and retry.",
  });
}

async function readError(res: Response): Promise<AiRequestError> {
  try {
    const body = (await res.json()) as { error?: AiError };
    if (body.error?.code) return new AiRequestError(body.error);
  } catch {
    // not JSON
  }
  return new AiRequestError({ code: "unknown", message: `Request failed (${res.status}). Please retry.` });
}

/** POST JSON (or FormData) and return parsed JSON, throwing AiRequestError on failure. */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw networkError();
  }
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "done"; questionId: string | null; none?: boolean }
  | { type: "error"; error: AiError };

type AnswerBody =
  | { mode?: "question"; sessionId: string; question: string; questionId?: string }
  | { mode: "copilot"; sessionId: string; transcript: string };

/**
 * Calls /api/answer and invokes onText for every streamed chunk.
 * Resolves with the saved question id (null if nothing was saved; for copilot, null when no question was found).
 */
export async function streamAnswer(
  body: AnswerBody,
  onText: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw networkError();
  }
  if (!res.ok || !res.body) throw await readError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: string | null | undefined;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === "text") onText(event.text);
    else if (event.type === "done") done = event.questionId;
    else if (event.type === "error") throw new AiRequestError(event.error);
  };

  try {
    while (true) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handle(buffer);
  } catch (e) {
    if (e instanceof AiRequestError || (e as Error).name === "AbortError") throw e;
    throw networkError();
  }

  if (done === undefined) throw networkError(); // stream ended early
  return done;
}
