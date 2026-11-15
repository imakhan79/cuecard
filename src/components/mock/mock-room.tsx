"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Mic, MicOff, PhoneOff, Play, Send, UserRound, Volume2, VolumeX } from "lucide-react";
import { ErrorNotice } from "@/components/error-notice";
import { AiRequestError, postJson, streamMockTurn } from "@/lib/ai/client";
import type { AiError } from "@/lib/ai/errors";
import type { MockInterview, MockReport, MockTurn } from "@/lib/types";
import { MockReportView } from "./mock-report";
import { useDictation, useInterviewerVoice } from "./use-voice";

type Phase = "ready" | "interviewer" | "answering" | "reporting" | "done";
type Bubble = { role: MockTurn["role"]; text: string };

const SENTENCE_END = /[.!?…]["')\]]?\s/g;

function stripTag(raw: string) {
  const nl = raw.indexOf("\n");
  if (nl === -1) return /^\s*\[?(Q|F|END)\]?\s*$/i.test(raw) || raw.trim().startsWith("[") ? "" : raw;
  return /^\s*\[?(Q|F|END)\]?\s*$/i.test(raw.slice(0, nl)) ? raw.slice(nl + 1).trimStart() : raw;
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function MockRoom({ mock, title }: { mock: MockInterview; title: string }) {
  const router = useRouter();
  const voice = useInterviewerVoice();
  const dict = useDictation();

  const [phase, setPhase] = useState<Phase>(mock.report ? "done" : "ready");
  const [bubbles, setBubbles] = useState<Bubble[]>(() => mock.transcript.map((t) => ({ role: t.role, text: t.text })));
  const [live, setLive] = useState(""); // interviewer text being streamed
  const [error, setError] = useState<AiError | null>(null);
  const [report, setReport] = useState<MockReport | null>(mock.report);
  const [elapsed, setElapsed] = useState(0);
  const retry = useRef<(() => void) | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const asked = bubbles.filter((b) => b.role === "interviewer").length;
  const answered = bubbles.filter((b) => b.role === "candidate").length;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, live, dict.interim]);

  // Answer timer.
  useEffect(() => {
    if (phase !== "answering") return;
    const started = Date.now();
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      window.clearInterval(t);
      setElapsed(0);
    };
  }, [phase]);

  const fail = useCallback((e: unknown, again: () => void) => {
    if ((e as Error)?.name === "AbortError") return;
    setError(e instanceof AiRequestError ? e.error : { code: "unknown", message: "Something went wrong. Please retry." });
    retry.current = again;
  }, []);

  async function finish() {
    setPhase("reporting");
    setError(null);
    voice.cancel();
    dict.stop();
    try {
      const { report } = await postJson<{ report: MockReport }>(`/api/mock/${mock.id}/report`, {});
      setReport(report);
      setPhase("done");
      router.refresh();
    } catch (e) {
      setPhase("answering");
      fail(e, () => void finish());
    }
  }

  async function turn(answer?: string) {
      setError(null);
      setPhase("interviewer");
      dict.stop();
      const ctrl = new AbortController();
      abort.current = ctrl;

      let raw = "";
      let spoken = 0; // chars of the visible text already sent to TTS
      let lastSpeech: Promise<void> = Promise.resolve();
      const speakUpTo = (text: string, all: boolean) => {
        let cut = spoken;
        if (all) cut = text.length;
        else {
          SENTENCE_END.lastIndex = spoken;
          let m: RegExpExecArray | null;
          while ((m = SENTENCE_END.exec(text))) cut = m.index + m[0].length;
        }
        if (cut > spoken) {
          lastSpeech = voice.say(text.slice(spoken, cut));
          spoken = cut;
        }
      };

      try {
        const { end } = await streamMockTurn(
          mock.id,
          answer,
          (chunk) => {
            raw += chunk;
            const visible = stripTag(raw);
            setLive(visible);
            speakUpTo(visible, false);
          },
          ctrl.signal,
        );
        const visible = stripTag(raw).trim();
        speakUpTo(visible, true);
        setBubbles((b) => [...b, { role: "interviewer", text: visible }]);
        setLive("");
        await lastSpeech;
        if (end) {
          await finish();
        } else {
          dict.reset();
          setPhase("answering");
          if (dict.supported) dict.start();
        }
      } catch (e) {
        setLive("");
        voice.cancel();
        setPhase(answer ? "answering" : "ready");
        if (answer) dict.setText(answer);
        fail(e, () => void turn(answer));
      }
  }

  const submit = () => {
    const text = `${dict.text} ${dict.interim}`.trim();
    if (!text) return;
    dict.stop();
    setBubbles((b) => [...b, { role: "candidate", text }]);
    void turn(text);
  };

  const endEarly = () => {
    abort.current?.abort();
    voice.cancel();
    if (answered === 0) {
      router.push(`/sessions/${mock.session_id}`);
      return;
    }
    void finish();
  };

  /* ---------------- report ---------------- */

  if (phase === "done" && report) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/sessions/${mock.session_id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Back to {title}
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mock interview report</h1>
          <p className="mt-1 text-sm capitalize text-muted">{mock.kind} · {answered} answers</p>
        </div>
        <MockReportView report={report} />
        <details className="card overflow-hidden">
          <summary className="cursor-pointer list-none p-4 text-sm font-semibold">Full transcript</summary>
          <div className="space-y-3 border-t border-border p-4 text-sm">
            {bubbles.map((b, i) => (
              <p key={i}><span className="font-semibold">{b.role === "interviewer" ? "Interviewer" : "You"}:</span> {b.text}</p>
            ))}
          </div>
        </details>
      </div>
    );
  }

  /* ---------------- call ---------------- */

  const interviewerTalking = phase === "interviewer";
  const answerText = `${dict.text}${dict.interim ? ` ${dict.interim}` : ""}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/sessions/${mock.session_id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> {title}
        </Link>
        <span className="text-sm capitalize text-muted">
          {mock.kind} · question {Math.min(asked || 1, mock.question_count)} of ~{mock.question_count}
        </span>
      </div>

      {/* Interviewer stage */}
      <div className="card flex flex-col items-center gap-4 bg-gradient-to-b from-accent-soft/70 to-surface px-5 py-8 text-center">
        <div className="relative">
          {(voice.speaking || interviewerTalking) && <span className="absolute inset-0 animate-ping rounded-full bg-accent/25" />}
          <div className={`relative grid size-24 place-items-center rounded-full bg-accent text-accent-fg shadow-lg transition ${voice.speaking ? "scale-105" : ""}`}>
            <UserRound className="size-12" />
          </div>
        </div>
        <div>
          <p className="font-semibold">AI Interviewer</p>
          <p className="text-sm text-muted">
            {phase === "ready" && (bubbles.length ? "Ready to continue" : "Ready when you are")}
            {phase === "interviewer" && (voice.speaking ? "Speaking…" : "Thinking…")}
            {phase === "answering" && (dict.listening ? `Listening · ${fmt(elapsed)}` : `Your turn · ${fmt(elapsed)}`)}
            {phase === "reporting" && "Writing your feedback report…"}
          </p>
        </div>
        {phase === "ready" && (
          <div className="flex w-full max-w-sm flex-col gap-3">
            {voice.supported && voice.voices.length > 1 && (
              <select className="input text-sm" value={voice.voiceName} onChange={(e) => voice.setVoiceName(e.target.value)} aria-label="Interviewer voice">
                {voice.voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            )}
            <button type="button" onClick={() => void turn()} className="btn-primary py-3 text-base">
              <Play className="size-5" /> {bubbles.length ? "Resume interview" : "Start interview"}
            </button>
            {!dict.supported && <p className="text-xs text-muted">Voice answers need Chrome, Edge or Safari. You can type your answers instead.</p>}
          </div>
        )}
        {phase === "reporting" && <Loader2 className="size-6 animate-spin text-accent" />}
      </div>

      {error && <ErrorNotice error={error} onRetry={() => retry.current?.()} />}

      {/* Conversation */}
      {(bubbles.length > 0 || live) && (
        <div className="space-y-3">
          {bubbles.map((b, i) => (
            <div key={i} className={`flex ${b.role === "candidate" ? "justify-end" : ""}`}>
              <p className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                b.role === "candidate" ? "rounded-br-md bg-accent text-accent-fg" : "rounded-bl-md border border-border bg-surface"
              }`}>{b.text}</p>
            </div>
          ))}
          {live && (
            <div className="flex">
              <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-[15px] leading-relaxed">{live}</p>
            </div>
          )}
          <div ref={bottom} />
        </div>
      )}

      {/* Answer box */}
      {phase === "answering" && (
        <div className="card sticky bottom-3 space-y-3 p-4 shadow-lg">
          <textarea
            rows={4}
            className="input resize-none"
            value={answerText}
            onChange={(e) => dict.setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={dict.listening ? "Speak your answer. It appears here as you talk…" : "Type your answer, or turn on the mic…"}
            aria-label="Your answer"
          />
          {dict.error && <p className="text-xs text-danger">{dict.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {dict.supported && (
              <button
                type="button"
                onClick={dict.listening ? dict.stop : dict.start}
                className={`btn size-11 p-0 ${dict.listening ? "bg-danger text-white" : "btn-secondary"}`}
                aria-label={dict.listening ? "Mute microphone" : "Unmute microphone"}
                aria-pressed={dict.listening}
              >
                {dict.listening ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              </button>
            )}
            <button type="button" onClick={submit} disabled={!answerText.trim()} className="btn-primary flex-1 sm:flex-none">
              <Send className="size-4" /> Done answering
            </button>
            <span className="hidden text-xs text-muted sm:inline">Ctrl+Enter</span>
          </div>
        </div>
      )}

      {/* Call controls */}
      {phase !== "ready" && phase !== "reporting" && (
        <div className="flex items-center justify-center gap-3 pb-4">
          {voice.supported && (
            <button type="button" onClick={() => voice.setMuted(!voice.muted)} className="btn-secondary" aria-pressed={voice.muted}>
              {voice.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              {voice.muted ? "Voice off" : "Voice on"}
            </button>
          )}
          <button type="button" onClick={endEarly} className="btn bg-danger text-white hover:brightness-110">
            <PhoneOff className="size-4" /> End &amp; get feedback
          </button>
        </div>
      )}
    </div>
  );
}
