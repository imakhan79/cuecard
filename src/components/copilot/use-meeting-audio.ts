"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CaptureError = { code: "no_audio" | "denied" | "unsupported" | "failed"; message: string };

type Options = {
  /** Called with each recorded utterance (cut at a natural pause). */
  onClip: (clip: Blob, pcm16k: Float32Array) => void;
  /** Called when the other side starts speaking. */
  onVoiceStart?: () => void;
};

const MIN_VOICE_RMS = 0.004; // absolute floor for the adaptive speech threshold
const NO_SIGNAL_MS = 8000; // warn if the shared tab is completely silent this long
const PAUSE_MS = 1200; // silence that ends an utterance (longer = fewer, complete clips)
const MIN_CLIP_MS = 1000;
const MAX_CLIP_MS = 20000;

/** Concatenates PCM chunks and resamples to `outRate` (box filter). */
function resample(chunks: Float32Array[], inRate: number, outRate: number): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    input.set(c, o);
    o += c.length;
  }
  const ratio = inRate / outRate;
  const length = Math.floor(total / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
  }
  return out;
}

/** Encodes mono PCM as 16-bit WAV. */
function toWav(pcm: Float32Array, outRate: number): Blob {
  const length = pcm.length;
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const str = (off: number, s: string) => [...s].forEach((ch, i) => view.setUint8(off + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const s = pcm[i];
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

/**
 * Captures the meeting's audio via screen/tab sharing (getDisplayMedia) and splits it
 * into utterances using a simple volume-based voice activity detector.
 */
export function useMeetingAudio({ onClip, onVoiceStart }: Options) {
  const [active, setActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  /** True when the shared source has produced no sound at all for a while (wrong tab, muted call…). */
  const [noSignal, setNoSignal] = useState(false);
  const [error, setError] = useState<CaptureError | null>(null);

  const cbs = useRef({ onClip, onVoiceStart });
  useEffect(() => {
    cbs.current = { onClip, onVoiceStart };
  }, [onClip, onVoiceStart]);

  const cleanup = useRef<(() => void) | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);

  /** Grabs the current frame of the shared tab/screen as a JPEG (for Screen Help). */
  const grabFrame = useCallback(async (): Promise<Blob | null> => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    return frameToJpeg(v);
  }, []);

  const stop = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setActive(false);
    setSpeaking(false);
    setLevel(0);
    setNoSignal(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia || typeof AudioContext === "undefined") {
      setError({ code: "unsupported", message: "This browser can't capture meeting audio. Use Chrome or Edge on desktop, or switch to Microphone mode." });
      return;
    }

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        // Video is required by browsers; we only use it for Screen Help.
        // displaySurface "browser" opens Chrome's picker on the "Chrome Tab" list, the only
        // choice (besides Entire screen on Windows) that can include audio.
        video: { displaySurface: "browser" } as MediaTrackConstraints,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        ...({
          systemAudio: "include",
          preferCurrentTab: false,
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
        } as object),
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

    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream(display.getVideoTracks());
    v.play().catch(() => {});
    video.current = v;

    const audioTracks = display.getAudioTracks();
    if (!audioTracks.length) {
      const surface = (display.getVideoTracks()[0]?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
      display.getTracks().forEach((t) => t.stop());
      setError({
        code: "no_audio",
        message:
          surface === "window"
            ? "You shared a window, and windows can't share sound. Click Start copilot again, choose the “Chrome Tab” option, pick your meeting tab, and keep “Also share tab audio” switched on."
            : surface === "monitor"
              ? "Your screen was shared without sound. Click Start copilot again and switch on “Also share system audio” at the bottom (Windows), or choose “Chrome Tab” and pick the meeting tab instead."
              : "The tab was shared without sound. Click Start copilot again, pick your meeting tab, and make sure “Also share tab audio” is switched on at the bottom.",
      });
      return;
    }

    const audioStream = new MediaStream(audioTracks);
    const ctx = new AudioContext();
    // The share dialog can swallow the click's user activation, leaving the context suspended
    // (which makes it hear pure silence). Resume it explicitly.
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(audioStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);

    // Record raw PCM and encode each utterance as 16 kHz mono WAV, a format every
    // speech-to-text service accepts (Chrome's MediaRecorder only makes WebM).
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    let chunks: Float32Array[] = [];
    let clipStart = 0;
    let heardVoice = false;
    let lastVoice = 0;
    let voiceNow = false;
    let noiseFloor = 0.002;
    const sharedAt = performance.now();
    let everHeard = false;
    let noSignalNow = false;

    processor.onaudioprocess = (e) => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    const begin = () => {
      chunks = [];
      heardVoice = false;
      clipStart = performance.now();
    };

    const cut = (send: boolean) => {
      const parts = chunks;
      const duration = performance.now() - clipStart;
      begin();
      if (send && duration >= MIN_CLIP_MS && parts.length) {
        const pcm = resample(parts, ctx.sampleRate, 16000);
        cbs.current.onClip(toWav(pcm, 16000), pcm);
      }
    };

    begin();

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 12));

      // Adaptive threshold: track the background noise floor and treat clearly-louder audio as speech.
      noiseFloor = rms < noiseFloor ? rms : noiseFloor * 0.995 + rms * 0.005;
      const threshold = Math.max(MIN_VOICE_RMS, noiseFloor * 3);

      if (rms > 0.0005) everHeard = true;
      // Meet sends pure silence between speakers, so only warn if nothing at all has been heard yet.
      const silentTooLong = !everHeard && performance.now() - sharedAt > NO_SIGNAL_MS;
      if (silentTooLong !== noSignalNow) {
        noSignalNow = silentTooLong;
        setNoSignal(silentTooLong);
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const now = performance.now();
      const isVoice = rms > threshold;
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
      processor.onaudioprocess = null;
      processor.disconnect();
      ctx.close().catch(() => {});
      v.srcObject = null;
      video.current = null;
    };
    setActive(true);
  }, [stop]);

  useEffect(() => () => cleanup.current?.(), []);

  /** Small fingerprint of the shared screen, for change detection. */
  const signature = useCallback(() => (video.current ? frameSignature(video.current) : null), []);

  return { active, speaking, level, noSignal, error, start, stop, grabFrame, signature };
}

/** Draws a video frame to a canvas (max 1600px wide) and encodes it as JPEG. */
export function frameToJpeg(v: HTMLVideoElement): Promise<Blob | null> {
  const scale = Math.min(1, 1600 / v.videoWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * scale);
  c.height = Math.round(v.videoHeight * scale);
  c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.85));
}

/** One-off screenshot: asks the user to pick a tab/window/screen, grabs one frame, stops sharing. */
export async function captureScreenOnce(): Promise<Blob | null> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.srcObject = stream;
    await v.play();
    await new Promise((r) => setTimeout(r, 300));
    return await frameToJpeg(v);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Tiny 24x24 grayscale fingerprint of a frame, used to detect when the screen content changes. */
export function frameSignature(v: HTMLVideoElement): Uint8ClampedArray | null {
  if (!v.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = 24;
  c.height = 24;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(v, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  const out = new Uint8ClampedArray(576);
  for (let i = 0; i < 576; i++) out[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return out;
}
