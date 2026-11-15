"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WhisperStatus = "idle" | "loading" | "ready" | "error";

/** Client for the on-device Whisper worker: free, private, no rate limits. */
export function useLocalWhisper() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>());
  const nextId = useRef(1);
  const readyWaiters = useRef<(() => void)[]>([]);
  const [status, setStatus] = useState<WhisperStatus>("idle");
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const files = useRef(new Map<string, { loaded: number; total: number }>());

  const ensureWorker = useCallback(() => {
    if (worker.current) return worker.current;
    const w = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: "progress"; file: string; loaded: number; total: number }
        | { type: "ready" }
        | { type: "result"; id: number; text: string }
        | { type: "error"; id: number; message: string };
      if (m.type === "progress") {
        files.current.set(m.file, { loaded: m.loaded, total: m.total });
        let loaded = 0;
        let total = 0;
        files.current.forEach((f) => {
          loaded += f.loaded;
          total += f.total;
        });
        setProgress({ loaded, total });
      } else if (m.type === "ready") {
        setStatus("ready");
        readyWaiters.current.splice(0).forEach((r) => r());
      } else if (m.type === "result") {
        pending.current.get(m.id)?.resolve(m.text);
        pending.current.delete(m.id);
      } else if (m.type === "error") {
        if (m.id === -1) {
          setStatus("error");
          setError(m.message);
        }
        pending.current.get(m.id)?.reject(new Error(m.message));
        pending.current.delete(m.id);
      }
    };
    w.onerror = () => {
      setStatus("error");
      setError("The on-device speech model couldn't start in this browser.");
    };
    worker.current = w;
    return w;
  }, []);

  /** Downloads (first time) and warms up the model. */
  const load = useCallback(() => {
    if (status === "ready") return Promise.resolve();
    setStatus((s) => (s === "ready" ? s : "loading"));
    setError(null);
    const w = ensureWorker();
    return new Promise<void>((resolve) => {
      readyWaiters.current.push(resolve);
      w.postMessage({ type: "load" });
    });
  }, [ensureWorker, status]);

  /** Transcribes 16 kHz mono PCM. */
  const transcribe = useCallback(
    (audio: Float32Array, language?: string) => {
      const w = ensureWorker();
      const id = nextId.current++;
      return new Promise<string>((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        w.postMessage({ type: "transcribe", id, audio, language }, [audio.buffer]);
      });
    },
    [ensureWorker],
  );

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  return { status, progress, error, load, transcribe };
}
