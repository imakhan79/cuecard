/// <reference lib="webworker" />
/**
 * On-device speech recognition (OpenAI Whisper via Transformers.js), running in a Web Worker.
 * Free, private and unlimited: audio never leaves the browser and there is no API rate limit.
 * The model (~80 MB) downloads once and is then cached by the browser.
 */
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL = "onnx-community/whisper-base";

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

function load() {
  asr ??= (async () => {
    const gpu = "gpu" in navigator && (await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
    const p = await pipeline("automatic-speech-recognition", MODEL, {
      device: gpu ? "webgpu" : "wasm",
      dtype: gpu ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
      progress_callback: (p: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
        if (p.status === "progress") self.postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total });
      },
    });
    return p as AutomaticSpeechRecognitionPipeline;
  })();
  return asr;
}

// Whisper sometimes "hears" these in near-silence; drop them.
const HALLUCINATIONS = /^(\[.*\]|\(.*\)|thank you\.?|thanks for watching!?|you|bye\.?|\.+|subtitles by.*)$/i;

self.onmessage = async (e: MessageEvent<{ type: "load" } | { type: "transcribe"; id: number; audio: Float32Array; language?: string }>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load();
      self.postMessage({ type: "ready" });
      return;
    }
    const t = await load();
    const out = await t(msg.audio, {
      language: msg.language && msg.language !== "auto" ? msg.language : undefined,
      task: "transcribe",
      chunk_length_s: 30,
    });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim();
    self.postMessage({ type: "result", id: msg.id, text: HALLUCINATIONS.test(text) ? "" : text });
  } catch (err) {
    self.postMessage({ type: "error", id: "id" in msg ? msg.id : -1, message: (err as Error).message || "Speech model failed" });
  }
};
