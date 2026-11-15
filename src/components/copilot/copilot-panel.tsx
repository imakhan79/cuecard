"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ClipboardCheck,
  EyeOff,
  Languages,
  ScanText,
  Info,
  Loader2,
  Mic,
  MonitorUp,
  PictureInPicture2,
  Play,
  Sparkles,
  Square,
  Wand2,
  Zap,
} from "lucide-react";
import { ErrorNotice } from "@/components/error-notice";
import { Markdown } from "@/components/markdown";
import { useSpeech } from "@/components/use-speech";
import { AiRequestError, postJson, streamAnswer } from "@/lib/ai/client";
import type { AiError } from "@/lib/ai/errors";
import { SHARE_TIPS, detectPlatform } from "@/lib/meeting";
import { MeetingLink } from "./meeting-link";
import { PopOutPortal, usePopOut } from "./pop-out";
import { captureScreenOnce, useMeetingAudio } from "./use-meeting-audio";
import { useLocalWhisper } from "./use-local-whisper";
import { DebriefView } from "@/components/debrief-view";
import { streamForm } from "@/lib/ai/client";
import type { Debrief } from "@/lib/types";
import { LANGUAGES } from "@/lib/languages";

type Line = { id: number; text: string };
type Card = { id: number; question: string; answer: string; streaming: boolean };
type Source = "meeting" | "mic";

const AUTO_DELAY_MS = 450; // extra wait after an utterance before auto-answering
const QUESTION_END = /\?\s*$|\b(tell me|walk me through|describe|explain|why|how would you|what would you|give me an example)\b/i;
const MIN_WORDS = 4;

function parseStream(text: string) {
  const nl = text.indexOf("\n");
  if (nl === -1) return { question: null as string | null, answer: "" };
  const question = text.slice(0, nl).replace(/^Q:\s*/i, "").trim();
  return { question, answer: text.slice(nl + 1).trimStart() };
}

const isNone = (q: string | null) => !!q && /^none\.?$/i.test(q);

export function CopilotPanel({ sessionId, meetingUrl }: { sessionId: string; meetingUrl: string | null }) {
  const router = useRouter();
  const platform = detectPlatform(meetingUrl);
  const [source, setSource] = useState<Source>("meeting");
  const [auto, setAuto] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<AiError | null>(null);
  const [transcribing, setTranscribing] = useState(0);
  const [running, setRunning] = useState(false);
  const [answeredId, setAnsweredId] = useState(0);

  const lineId = useRef(0);
  const linesRef = useRef<Line[]>([]);
  const answeredUpTo = useRef(0); // id of the last line already answered
  const autoTimer = useRef<number | null>(null);
  const streamingRef = useRef(false);
  const pendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const autoRef = useRef(auto);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  // Private mode: suggestions are shown but nothing from this call is saved.
  const [privateMode, setPrivateMode] = useState(false);
  const privateRef = useRef(false);
  useEffect(() => {
    privateRef.current = privateMode;
  }, [privateMode]);
  const [lang, setLang] = useState("auto");
  const langRef = useRef("auto");
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const popout = usePopOut();

  /* ---------------- answering ---------------- */

  const answerNow = useCallback(async () => {
    const all = linesRef.current;
    const fresh = all.filter((l) => l.id > answeredUpTo.current);
    const freshWords = fresh.map((l) => l.text).join(" ").split(/\s+/).filter(Boolean).length;
    if (!fresh.length || freshWords < MIN_WORDS) return;
    if (streamingRef.current) {
      pendingRef.current = true;
      return;
    }

    const upTo = all[all.length - 1].id;
    // Context: earlier lines (already answered) plus the new ones, capped.
    const transcript = all
      .slice(-25)
      .map((l) => (l.id > answeredUpTo.current ? l.text : `(earlier) ${l.text}`))
      .join("\n")
      .slice(-6000);

    streamingRef.current = true;
    setError(null);
    const id = Date.now();
    setCards((c) => [{ id, question: "", answer: "", streaming: true }, ...c].slice(0, 20));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let raw = "";

    try {
      const saved = await streamAnswer(
        { mode: "copilot", sessionId, transcript, save: !privateRef.current },
        (chunk) => {
          raw += chunk;
          const { question, answer } = parseStream(raw);
          if (question && !isNone(question)) {
            setCards((c) => c.map((x) => (x.id === id ? { ...x, question, answer } : x)));
          }
        },
        ctrl.signal,
      );
      answeredUpTo.current = upTo;
      setAnsweredId(upTo);
      const { question } = parseStream(raw);
      if (!question || isNone(question) || (!saved && !privateRef.current)) {
        setCards((c) => c.filter((x) => x.id !== id)); // no question detected
      } else {
        setCards((c) => c.map((x) => (x.id === id ? { ...x, streaming: false } : x)));
        router.refresh();
      }
    } catch (e) {
      setCards((c) => c.filter((x) => x.id !== id));
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof AiRequestError ? e.error : { code: "unknown", message: "Something went wrong." });
      }
    } finally {
      streamingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void answerRef.current();
      }
    }
  }, [sessionId, router]);

  const answerRef = useRef(answerNow);
  useEffect(() => {
    answerRef.current = answerNow;
  }, [answerNow]);

  const scheduleAuto = useCallback(() => {
    if (autoTimer.current) window.clearTimeout(autoTimer.current);
    if (!autoRef.current) return;
    // A clear question: answer right away. Otherwise wait briefly in case they keep talking.
    const lastLine = linesRef.current[linesRef.current.length - 1]?.text ?? "";
    autoTimer.current = window.setTimeout(() => void answerNow(), QUESTION_END.test(lastLine) ? 0 : AUTO_DELAY_MS);
  }, [answerNow]);

  const cancelAuto = useCallback(() => {
    if (autoTimer.current) window.clearTimeout(autoTimer.current);
    autoTimer.current = null;
  }, []);

  const addLine = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const line = { id: ++lineId.current, text: text.trim() };
      linesRef.current = [...linesRef.current, line].slice(-200);
      setLines(linesRef.current);
      scheduleAuto();
    },
    [scheduleAuto],
  );

  /* ---------------- meeting audio ---------------- */

  // Listening engine: on-device Whisper (free, unlimited, private) or cloud (Gemini/Deepgram/OpenAI).
  const [engine, setEngine] = useState<"device" | "cloud">("device");
  const engineRef = useRef<"device" | "cloud">("device");
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);
  const whisper = useLocalWhisper();
  const { transcribe: localTranscribe } = whisper;

  const onClip = useCallback(
    (clip: Blob, pcm: Float32Array) => {
      // Transcribe clips one at a time so lines stay in order.
      setTranscribing((n) => n + 1);
      queue.current = queue.current.then(async () => {
        try {
          if (engineRef.current === "device") {
            addLine(await localTranscribe(pcm, langRef.current));
            return;
          }
          // Cloud: retry rate-limited clips quietly (free tiers have per-minute caps).
          for (let attempt = 0; ; attempt++) {
            try {
              const form = new FormData();
              form.append("audio", clip, "clip.wav");
              form.append("lang", langRef.current);
              const { text } = await postJson<{ text: string }>("/api/transcribe", form);
              addLine(text);
              return;
            } catch (e) {
              if (e instanceof AiRequestError && e.error.code === "rate_limit" && attempt < 3) {
                await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
                continue;
              }
              throw e;
            }
          }
        } catch (e) {
          if (e instanceof AiRequestError) setError(e.error);
          else setError({ code: "unknown", message: (e as Error).message || "Transcription failed." });
        } finally {
          setTranscribing((n) => n - 1);
        }
      });
    },
    [addLine, localTranscribe],
  );

  const meeting = useMeetingAudio({ onClip, onVoiceStart: cancelAuto });

  /* ---------------- microphone (browser speech recognition) ---------------- */

  const speech = useSpeech(addLine);
  const { listening: micListening, start: micStart } = speech;
  // Chrome ends continuous recognition after a while; keep it going while running.
  useEffect(() => {
    if (running && source === "mic" && !micListening) {
      const t = window.setTimeout(micStart, 300);
      return () => window.clearTimeout(t);
    }
  }, [running, source, micListening, micStart]);

  /* ---------------- start / stop ---------------- */

  const start = async () => {
    setError(null);
    if (source === "meeting") {
      if (engine === "device") void whisper.load(); // downloads once, then cached
      await meeting.start();
    } else {
      speech.start();
      setRunning(true);
    }
  };

  // Meeting capture can also be ended from the browser's sharing bar, so derive it.
  const isRunning = source === "meeting" ? meeting.active : running;


  const stop = () => {
    setRunning(false);
    meeting.stop();
    speech.stop();
    cancelAuto();
  };

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  const live = source === "meeting" ? meeting.active : running && speech.listening;
  const captureError = source === "meeting" ? meeting.error?.message : speech.error;
  const current = cards[0] ?? null;

  /* ---------------- Screen Help ---------------- */

  const [screen, setScreen] = useState<{ text: string; streaming: boolean; error: AiError | null } | null>(null);
  const [autoScreen, setAutoScreen] = useState(false);
  const screenBusy = useRef(false);
  const { active: meetingActive, grabFrame, signature } = meeting;

  const screenHelp = useCallback(async () => {
    if (screenBusy.current) return;
    screenBusy.current = true;
    setScreen({ text: "", streaming: true, error: null });
    try {
      const shot = meetingActive ? await grabFrame() : await captureScreenOnce();
      if (!shot) throw new AiRequestError({ code: "bad_request", message: "Couldn't capture the screen. Try again." });
      const form = new FormData();
      form.append("image", shot, "screen.jpg");
      form.append("sessionId", sessionId);
      let text = "";
      await streamForm("/api/screen-help", form, (c) => {
        text += c;
        setScreen({ text, streaming: true, error: null });
      });
      setScreen({ text, streaming: false, error: null });
    } catch (e) {
      if ((e as Error).name === "NotAllowedError") setScreen(null);
      else
        setScreen({
          text: "",
          streaming: false,
          error: e instanceof AiRequestError ? e.error : { code: "unknown", message: "Screen Help failed. Please retry." },
        });
    } finally {
      screenBusy.current = false;
    }
  }, [meetingActive, grabFrame, sessionId]);

  // Automatic Screen Help: when the shared screen changes and then settles, read it (at most every 25s).
  useEffect(() => {
    if (!autoScreen || !meetingActive) return;
    let last: Uint8ClampedArray | null = null;
    let changedAt = 0;
    let lastRun = 0;
    const t = window.setInterval(() => {
      const sig = signature();
      if (!sig) return;
      if (last) {
        let diff = 0;
        for (let i = 0; i < sig.length; i++) diff += Math.abs(sig[i] - last[i]);
        if (diff / sig.length > 10) changedAt = Date.now();
      } else changedAt = Date.now();
      last = sig;
      const now = Date.now();
      if (changedAt && now - changedAt > 2500 && now - lastRun > 25000) {
        changedAt = 0;
        lastRun = now;
        void screenHelp();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [autoScreen, meetingActive, signature, screenHelp]);

  /* ---------------- Debrief ---------------- */

  const [debrief, setDebrief] = useState<{ data: Debrief | null; loading: boolean; error: AiError | null } | null>(null);
  const endAndDebrief = async () => {
    stop();
    setDebrief({ data: null, loading: true, error: null });
    try {
      const { debrief } = await postJson<{ debrief: { report: Debrief } }>("/api/debrief", {
        sessionId,
        source: "live",
        transcript: linesRef.current.map((l) => l.text).join("\n").slice(-40000),
      });
      setDebrief({ data: debrief.report, loading: false, error: null });
      router.refresh();
    } catch (e) {
      setDebrief({
        data: null,
        loading: false,
        error: e instanceof AiRequestError ? e.error : { code: "unknown", message: "Debrief failed. Please retry." },
      });
    }
  };

  /* ---------------- UI ---------------- */

  const statusPill = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        live ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted"
      }`}
    >
      <span className={`size-2 rounded-full ${live ? "animate-pulse bg-danger" : "bg-muted/50"}`} />
      {live ? (meeting.speaking ? "Interviewer speaking" : "Listening") : "Not listening"}
      {transcribing > 0 && <Loader2 className="size-3 animate-spin" />}
    </span>
  );

  const answerView = (compact: boolean) => (
    <div className="space-y-3">
      {current ? (
        <div className="card overflow-hidden" aria-live="polite">
          <div className="border-b border-border bg-accent-soft/60 px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {current.streaming && !current.question ? "Detecting question…" : "Question"}
            </p>
            {current.question && <p className="mt-0.5 text-sm font-medium">{current.question}</p>}
          </div>
          <div className={compact ? "p-3" : "p-4 sm:p-5"}>
            {current.answer ? (
              <Markdown text={current.answer} />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin text-accent" /> Writing your answer…
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-2 p-6 text-center text-sm text-muted">
          <Sparkles className="size-5 text-accent" />
          {live ? "Waiting for the interviewer's question…" : "Start listening to get answers automatically."}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Meeting */}
      <MeetingLink sessionId={sessionId} initialUrl={meetingUrl} />

      {/* Controls */}
      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Audio source" className="grid w-full grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 sm:w-auto">
            {(
              [
                { id: "meeting", label: "Meeting audio", icon: MonitorUp },
                { id: "mic", label: "Microphone", icon: Mic },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="radio"
                aria-checked={source === id}
                disabled={isRunning}
                onClick={() => setSource(id)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  source === id ? "bg-surface text-fg shadow-sm" : "text-muted"
                }`}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          {statusPill}
        </div>

        <p className="flex gap-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {source === "meeting"
            ? SHARE_TIPS[platform ?? "other"]
            : "Uses your browser's speech recognition (Chrome/Edge, free). It hears the interviewer through your speakers, so don't use headphones in this mode."}
        </p>

        {source === "meeting" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Listening engine:</span>
            <div role="radiogroup" aria-label="Listening engine" className="inline-flex gap-1 rounded-lg bg-surface-2 p-1">
              {(
                [
                  { id: "device", label: "On-device · free, unlimited" },
                  { id: "cloud", label: "Cloud · faster" },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={engine === o.id}
                  disabled={isRunning}
                  onClick={() => setEngine(o.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${engine === o.id ? "bg-surface text-fg shadow-sm" : "text-muted"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {engine === "device" && whisper.status === "loading" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" />
                {whisper.progress && whisper.progress.total
                  ? `Downloading speech model ${Math.round((whisper.progress.loaded / whisper.progress.total) * 100)}% (one time)`
                  : "Loading speech model…"}
              </span>
            )}
            {engine === "device" && whisper.status === "ready" && <span className="text-xs text-success">Speech model ready</span>}
            {engine === "device" && whisper.status === "error" && <span className="text-xs text-danger">{whisper.error} Switch to Cloud.</span>}
          </div>
        )}

        {source === "meeting" && live && meeting.noSignal && (
          <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            No sound yet from the shared tab. Check that you picked the tab where the call is playing (not this Cuecard
            tab) and that the call isn&apos;t muted. If needed, click Stop and share again.
          </p>
        )}
        {source === "meeting" && live && (
          <div className="flex items-center gap-2" aria-hidden>
            <AudioLines className="size-4 text-muted" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-100" style={{ width: `${Math.round(meeting.level * 100)}%` }} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!isRunning ? (
            <button type="button" onClick={start} className="btn-primary">
              <Play className="size-4" /> Start copilot
            </button>
          ) : (
            <button type="button" onClick={stop} className="btn-secondary">
              <Square className="size-3.5" /> Stop
            </button>
          )}
          <button type="button" onClick={() => void answerNow()} disabled={!lines.length} className="btn-secondary" title="Answer the latest thing the interviewer said">
            <Zap className="size-4" /> Answer now
          </button>
          {popout.supported && (
            <button type="button" onClick={popout.win ? popout.close : popout.open} className="btn-secondary" title="Float the copilot on top of your meeting">
              <PictureInPicture2 className="size-4" /> {popout.win ? "Close pop-out" : "Pop out"}
            </button>
          )}
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            <Wand2 className="size-4 text-accent" /> Auto-answer
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button type="button" onClick={() => void screenHelp()} disabled={screen?.streaming} className="btn-secondary" title="Read a coding problem, diagram or error from your screen">
            {screen?.streaming ? <Loader2 className="size-4 animate-spin" /> : <ScanText className="size-4" />} Screen Help
          </button>
          <label className={`inline-flex items-center gap-2 text-sm ${meeting.active ? "cursor-pointer" : "opacity-50"}`} title="Re-read the shared screen automatically when it changes">
            <input type="checkbox" checked={autoScreen} disabled={!meeting.active} onChange={(e) => setAutoScreen(e.target.checked)} className="size-4 accent-[var(--accent)]" /> Auto
          </label>
          <label className="ml-auto inline-flex items-center gap-2 text-sm">
            <Languages className="size-4 text-muted" />
            <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={isRunning} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" aria-label="Interview language">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm" title="Don't save questions or answers from this call">
            <input type="checkbox" checked={privateMode} onChange={(e) => setPrivateMode(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            <EyeOff className="size-4 text-muted" /> Private
          </label>
          <button type="button" onClick={endAndDebrief} disabled={debrief?.loading} className="btn-secondary">
            {debrief?.loading ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />} End &amp; debrief
          </button>
        </div>
        <p className="text-xs text-muted">
          Suggestions appear only on your device and are never sent into the meeting.{" "}
          {privateMode ? "Private mode is on, so nothing from this call is saved." : "Questions and answers are saved to this interview's history (only you can see them)."}
        </p>

        {captureError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{captureError}</p>}
        {error && <ErrorNotice error={error} onRetry={() => { setError(null); void answerNow(); }} />}
      </div>

      {debrief && (
        <div className="space-y-3">
          {debrief.loading && (
            <div className="card flex items-center gap-2 p-5 text-sm text-muted">
              <Loader2 className="size-4 animate-spin text-accent" /> Writing your debrief…
            </div>
          )}
          {debrief.error && <ErrorNotice error={debrief.error} onRetry={endAndDebrief} />}
          {debrief.data && <DebriefView debrief={debrief.data} />}
        </div>
      )}

      {screen && (
        <div className="card overflow-hidden" aria-live="polite">
          <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-4 py-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {screen.streaming ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <ScanText className="size-3.5 text-accent" />} Screen Help
            </span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setScreen(null)}>Close</button>
          </div>
          <div className="p-4 sm:p-5">
            {screen.error ? (
              <ErrorNotice error={screen.error} onRetry={() => void screenHelp()} />
            ) : screen.text ? (
              <Markdown text={screen.text} />
            ) : (
              <p className="text-sm text-muted">Reading your screen…</p>
            )}
          </div>
        </div>
      )}

      {/* Answer + transcript */}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {answerView(false)}
          {cards.slice(1, 6).map((c) => (
            <details key={c.id} className="card overflow-hidden">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">{c.question}</summary>
              <div className="border-t border-border p-4"><Markdown text={c.answer} /></div>
            </details>
          ))}
        </div>
        <div className="card flex h-80 flex-col overflow-hidden lg:h-auto lg:max-h-[520px]">
          <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Live transcript</p>
          <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
            {lines.length ? (
              lines.map((l) => (
                <p key={l.id} className={l.id > answeredId ? "text-fg" : "text-muted"}>{l.text}</p>
              ))
            ) : (
              <p className="text-muted">What the interviewer says will appear here.</p>
            )}
            <div ref={transcriptEnd} />
          </div>
        </div>
      </div>

      {popout.win && (
        <PopOutPortal win={popout.win}>
          <div className="flex min-h-dvh flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Cuecard Copilot</span>
              {statusPill}
            </div>
            <div className="flex-1 overflow-y-auto">{answerView(true)}</div>
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error.message}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => void answerNow()} className="btn-primary flex-1 py-2">
                <Zap className="size-4" /> Answer now
              </button>
              {isRunning && (
                <button type="button" onClick={stop} className="btn-secondary py-2">
                  <Square className="size-3.5" /> Stop
                </button>
              )}
            </div>
          </div>
        </PopOutPortal>
      )}
    </div>
  );
}
