"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/* ---------------------------------------------------------------- */
/* Text-to-speech: the interviewer's voice (browser speechSynthesis) */
/* ---------------------------------------------------------------- */

const noop = () => () => {};

function rankVoice(v: SpeechSynthesisVoice) {
  const n = v.name.toLowerCase();
  let score = 0;
  if (n.includes("natural") || n.includes("neural") || n.includes("online")) score += 5; // Edge neural voices
  if (n.includes("google")) score += 3;
  if (n.includes("samantha") || n.includes("daniel") || n.includes("ava")) score += 2;
  if (v.localService === false) score += 1;
  return score;
}

export function useInterviewerVoice() {
  const supported = useSyncExternalStore(noop, () => "speechSynthesis" in window, () => false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>("");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const queue = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const lang = (navigator.language || "en").slice(0, 2);
      const list = speechSynthesis
        .getVoices()
        .filter((v) => v.lang.toLowerCase().startsWith(lang))
        .sort((a, b) => rankVoice(b) - rankVoice(a));
      setVoices(list);
      setVoiceName((cur) => cur || list[0]?.name || "");
    };
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  useEffect(() => {
    voiceRef.current = voices.find((v) => v.name === voiceName) ?? null;
  }, [voices, voiceName]);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted && supported) speechSynthesis.cancel();
  }, [muted, supported]);

  /** Queue a sentence. Resolves when it has been spoken (immediately when muted). */
  const say = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!supported || mutedRef.current || !text.trim()) return resolve();
        const u = new SpeechSynthesisUtterance(text);
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = 1;
        u.pitch = 1;
        queue.current++;
        setSpeaking(true);
        const done = () => {
          queue.current = Math.max(0, queue.current - 1);
          if (!queue.current) setSpeaking(false);
          resolve();
        };
        u.onend = done;
        u.onerror = done;
        speechSynthesis.speak(u);
      }),
    [supported],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    speechSynthesis.cancel();
    queue.current = 0;
    setSpeaking(false);
  }, [supported]);

  useEffect(() => () => cancel(), [cancel]);

  return { supported, voices, voiceName, setVoiceName, speaking, muted, setMuted, say, cancel };
}

/* ---------------------------------------------------------------- */
/* Speech-to-text: the candidate's answer (browser SpeechRecognition) */
/* ---------------------------------------------------------------- */

type RecResult = { isFinal: boolean; 0: { transcript: string } };
type RecEvent = { resultIndex: number; results: ArrayLike<RecResult> };
interface Rec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecCtor = new () => Rec;

function recCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Continuous dictation with live (interim) text. Restarts itself if the browser stops early. */
export function useDictation() {
  const supported = useSyncExternalStore(noop, () => recCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const wanted = useRef(false);

  const startRec = useCallback(() => {
    const Ctor = recCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let live = "";
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) add += res[0].transcript;
        else live += res[0].transcript;
      }
      if (add) setFinalText((t) => (t ? `${t} ${add.trim()}` : add.trim()));
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wanted.current = false;
        setError("Microphone access is blocked. Allow it in your browser, or type your answer.");
      }
    };
    r.onend = () => {
      setInterim("");
      if (wanted.current) {
        try {
          r.start(); // keep going through pauses
          return;
        } catch {
          // fall through
        }
      }
      setListening(false);
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, []);

  const start = useCallback(() => {
    setError(null);
    wanted.current = true;
    rec.current?.abort();
    startRec();
  }, [startRec]);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setFinalText("");
    setInterim("");
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.abort();
    },
    [],
  );

  return { supported, listening, text: finalText, interim, setText: setFinalText, error, start, stop, reset };
}
