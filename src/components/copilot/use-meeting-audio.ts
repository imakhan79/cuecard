"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CaptureError = { code: "no_audio" | "denied" | "unsupported" | "failed"; message: string };

type Options = {
  /** Called with each recorded utterance (cut at a natural pause). */
  onClip: (clip: Blob) => void;
  /** Called when the other side starts speaking. */
  onVoiceStart?: () => void;
};

const VOICE_RMS = 0.012; // speech threshold
const PAUSE_MS = 800; // silence that ends an utterance
const MIN_CLIP_MS = 700;
const MAX_CLIP_MS = 20000;

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

/**
 * Captures the meeting's audio via screen/tab sharing (getDisplayMedia) and splits it
 * into utterances using a simple volume-based voice activity detector.
 */
export function useMeetingAudio({ onClip, onVoiceStart }: Options) {
  const [active, setActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<CaptureError | null>(null);

  const cbs = useRef({ onClip, onVoiceStart });
  useEffect(() => {
    cbs.current = { onClip, onVoiceStart };
  }, [onClip, onVoiceStart]);

  const cleanup = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setActive(false);
    setSpeaking(false);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setError({ code: "unsupported", message: "This browser can't capture meeting audio. Use Chrome or Edge on desktop, or switch to Microphone mode." });
      return;
    }

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true, // required by browsers; we never record video
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Chrome hints: offer system/tab audio and prefer a tab.
        ...({ systemAudio: "include", preferCurrentTab: false, selfBrowserSurface: "exclude" } as object),
      } as DisplayMediaStreamOptions);
    } catch (e) {
      const name = (e as Error).name;
      setError(
        name === "NotAllowedError"
          ? { code: "denied", message: "Sharing was cancelled or blocked. Click Start and choose the meeting tab or screen." }
          : { code: "failed", message: "Couldn't start sharing. Please try again." },
      );
      return;
    }

    const audioTracks = display.getAudioTracks();
    if (!audioTracks.length) {
      display.getTracks().forEach((t) => t.stop());
      setError({ code: "no_audio", message: "No audio was shared. Start again and turn on “Share tab audio” (or “Share system audio”)." });
      return;
    }

    const audioStream = new MediaStream(audioTracks);
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(audioStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const mime = pickMime();

    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let clipStart = 0;
    let heardVoice = false;
    let lastVoice = 0;
    let voiceNow = false;

    const begin = () => {
      chunks = [];
      heardVoice = false;
      clipStart = performance.now();
      recorder = new MediaRecorder(audioStream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.start();
    };

    const cut = (send: boolean) => {
      const r = recorder;
      if (!r || r.state === "inactive") return;
      const parts = chunks;
      const duration = performance.now() - clipStart;
      r.onstop = () => {
        if (send && duration >= MIN_CLIP_MS && parts.length) {
          cbs.current.onClip(new Blob(parts, { type: r.mimeType || "audio/webm" }));
        }
      };
      r.stop();
      begin();
    };

    begin();

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 12));

      const now = performance.now();
      const isVoice = rms > VOICE_RMS;
      if (isVoice) {
        lastVoice = now;
        if (!heardVoice) heardVoice = true;
        if (!voiceNow) {
          voiceNow = true;
          setSpeaking(true);
          cbs.current.onVoiceStart?.();
        }
      } else if (voiceNow && now - lastVoice > PAUSE_MS) {
        voiceNow = false;
        setSpeaking(false);
      }

      const length = now - clipStart;
      if (heardVoice && !voiceNow && now - lastVoice > PAUSE_MS) cut(true);
      else if (length > MAX_CLIP_MS) cut(heardVoice);
    }, 100);

    const onEnded = () => stop();
    display.getTracks().forEach((t) => t.addEventListener("ended", onEnded));

    cleanup.current = () => {
      window.clearInterval(timer);
      display.getTracks().forEach((t) => {
        t.removeEventListener("ended", onEnded);
        t.stop();
      });
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      ctx.close().catch(() => {});
    };
    setActive(true);
  }, [stop]);

  useEffect(() => () => cleanup.current?.(), []);

  return { active, speaking, level, error, start, stop };
}
