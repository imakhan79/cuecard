import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { errorResponse, toAiError, REFUSAL_MESSAGE } from "./claude";

type BetaStream = ReturnType<Anthropic["beta"]["messages"]["stream"]>;

/**
 * Turns a Claude message stream into an NDJSON response:
 *   {"type":"text","text":"…"} … {"type":"done", ...extra} | {"type":"error","error":{code,message}}
 * Connection errors before the first event become a normal JSON error response.
 */
export async function ndjsonResponse(
  req: Request,
  makeStream: () => BetaStream,
  onDone?: (text: string) => Promise<Record<string, unknown> | void>,
) {
  let stream: BetaStream;
  let iterator: AsyncIterator<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
  let first: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
  try {
    stream = makeStream();
    iterator = stream[Symbol.asyncIterator]();
    first = await iterator.next();
  } catch (err) {
    return errorResponse(err);
  }

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let text = "";
      try {
        let r = first;
        while (!r.done) {
          const ev = r.value;
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            text += ev.delta.text;
            send({ type: "text", text: ev.delta.text });
          }
          r = await iterator.next();
        }
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") {
          send({ type: "error", error: { code: "refused", message: REFUSAL_MESSAGE } });
          return;
        }
        const extra = (await onDone?.(text)) ?? {};
        send({ type: "done", ...extra });
      } catch (err) {
        if (!req.signal.aborted) send({ type: "error", error: toAiError(err).error });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
