"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Minimal Web Speech API typings (not in TypeScript's DOM lib).
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

/** Dictation via the browser's speech recognition. `supported` is false on browsers without it (e.g. Firefox). */
export function useSpeech(onText: (text: string) => void) {
  const supported = useSyncExternalStore(noop, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  }, [onText]);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(res[0].transcript.trim());
      }
    };
    r.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") {
        setError(e.error === "not-allowed" ? "Microphone access was blocked." : "Voice input stopped unexpectedly.");
      }
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }, []);

  useEffect(() => () => rec.current?.stop(), []);

  return { supported, listening, start, stop, error };
}
