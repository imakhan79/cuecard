"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ExternalLink,
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
import { PLATFORM_LABEL, SHARE_TIPS, detectPlatform } from "@/lib/meeting";
import { PopOutPortal, usePopOut } from "./pop-out";
import { useMeetingAudio } from "./use-meeting-audio";

type Line = { id: number; text: string };
type Card = { id: number; question: string; answer: string; streaming: boolean };
type Source = "meeting" | "mic";

const AUTO_DELAY_MS = 1400; // silence after an utterance before auto-answering
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
        { mode: "copilot", sessionId, transcript },
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
      if (!saved || isNone(question)) {
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
    autoTimer.current = window.setTimeout(() => void answerNow(), AUTO_DELAY_MS);
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

  const onClip = useCallback(
    (clip: Blob) => {
      // Transcribe clips one at a time so lines stay in order.
      setTranscribing((n) => n + 1);
      queue.current = queue.current.then(async () => {
        try {
          const form = new FormData();
          form.append("audio", clip, "clip.webm");
          form.append("lang", navigator.language || "en");
          const { text } = await postJson<{ text: string }>("/api/transcribe", form);
          addLine(text);
        } catch (e) {
          if (e instanceof AiRequestError) setError(e.error);
        } finally {
          setTranscribing((n) => n - 1);
        }
      });
    },
    [addLine],
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
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Meeting</p>
            {meetingUrl ? (
              <p className="truncate font-medium">{PLATFORM_LABEL[platform ?? "other"]} · <span className="text-muted">{meetingUrl}</span></p>
            ) : (
              <p className="text-sm text-muted">No meeting link yet. Add your Zoom, Teams or Meet link under <b>Details</b>.</p>
            )}
          </div>
          {meetingUrl && (
            <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <ExternalLink className="size-4" /> Join {platform && platform !== "other" ? PLATFORM_LABEL[platform] : "meeting"}
            </a>
          )}
        </div>
      </div>

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

        {captureError && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{captureError}</p>}
        {error && <ErrorNotice error={error} onRetry={() => { setError(null); void answerNow(); }} />}
      </div>

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
