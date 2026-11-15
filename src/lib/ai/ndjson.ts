import "server-only";
import { llmError, llmErrorResponse, startTextStream, type LlmRequest } from "./llm";

/**
 * Streams a generation as NDJSON:
 *   {"type":"text","text":"…"} … {"type":"done", ...extra} | {"type":"error","error":{code,message}}
 * Errors before the first chunk (bad key, no credit, rate limit…) become a normal JSON error response.
 * `onDone` receives the full text; it can return extra fields for the done event, or `{ skipDone: true }`.
 */
export async function ndjsonResponse(
  req: Request,
  llm: LlmRequest,
  onDone?: (text: string, send: (o: unknown) => void) => Promise<Record<string, unknown> | void>,
  onError?: () => Promise<void>,
) {
  let s;
  try {
    s = await startTextStream({ ...llm, signal: req.signal });
  } catch (err) {
    await onError?.();
    return llmErrorResponse(err);
  }
  const stream = s;

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let text = "";
      try {
        if (!stream.first.done && stream.first.value) {
          text += stream.first.value;
          send({ type: "text", text: stream.first.value });
        }
        for await (const chunk of stream.rest) {
          text += chunk;
          send({ type: "text", text: chunk });
        }
        const extra = (await onDone?.(text, send)) ?? {};
        if (!("skipDone" in extra)) send({ type: "done", ...extra });
      } catch (err) {
        await onError?.();
        if (!req.signal.aborted) send({ type: "error", error: llmError(err).error });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      void stream.rest.return(undefined);
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
