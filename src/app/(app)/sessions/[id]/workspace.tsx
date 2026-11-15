"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  FileText,
  History,
  Loader2,
  MessageSquareText,
  Radio,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Check,
} from "lucide-react";
import { ErrorNotice } from "@/components/error-notice";
import { Markdown } from "@/components/markdown";
import { MicButton } from "@/components/mic-button";
import { SessionForm } from "@/components/session-form";
import { AiRequestError, postJson, streamAnswer } from "@/lib/ai/client";
import type { AiError } from "@/lib/ai/errors";
import type { Answer, InterviewSession, Question, Resume } from "@/lib/types";
import { deleteQuestion, deleteSession, updateSession } from "../../actions";

type Tab = "live" | "practice" | "history";

function toAiError(e: unknown): AiError | null {
  if ((e as Error)?.name === "AbortError") return null;
  return e instanceof AiRequestError ? e.error : { code: "unknown", message: "Something went wrong. Please retry." };
}

export function Workspace({
  session,
  questions,
  resumes,
  resumeTitle,
}: {
  session: InterviewSession;
  questions: Question[];
  resumes: Pick<Resume, "id" | "title">[];
  resumeTitle: string | null;
}) {
  const [tab, setTab] = useState<Tab>("live");
  const [showDetails, setShowDetails] = useState(false);
  const [deleting, startDelete] = useTransition();
  const practice = questions.filter((q) => q.source === "practice");

  const tabs: { id: Tab; label: string; icon: typeof Radio; count?: number }[] = [
    { id: "live", label: "Live", icon: Radio },
    { id: "practice", label: "Practice", icon: Sparkles, count: practice.length },
    { id: "history", label: "History", icon: History, count: questions.length },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> All interviews
      </Link>

      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{session.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {(session.role || session.company) && <span>{[session.role, session.company].filter(Boolean).join(" · ")}</span>}
            <span className={`inline-flex items-center gap-1 ${resumeTitle ? "" : "text-warn"}`}>
              <FileText className="size-3.5" />
              {resumeTitle ?? "No resume linked"}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="btn-secondary shrink-0 px-3"
          aria-expanded={showDetails}
        >
          <Settings2 className="size-4" />
          <span className="hidden sm:inline">Details</span>
          <ChevronDown className={`size-4 transition ${showDetails ? "rotate-180" : ""}`} />
        </button>
      </div>

      {showDetails && (
        <div className="card mt-4 p-5 sm:p-6">
          <SessionForm
            action={updateSession}
            resumes={resumes}
            session={session}
            submitLabel="Save changes"
            onSaved={() => setShowDetails(false)}
          />
          <div className="mt-5 border-t border-border pt-4">
            <button
              type="button"
              disabled={deleting}
              className="btn-danger px-3"
              onClick={() => {
                if (confirm("Delete this interview and all its questions and answers?")) {
                  startDelete(() => deleteSession(session.id));
                }
              }}
            >
              <Trash2 className="size-4" /> Delete interview
            </button>
          </div>
        </div>
      )}

      <div role="tablist" className="mt-6 grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition ${
              tab === id ? "bg-accent text-accent-fg shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            <Icon className="size-4" />
            {label}
            {count ? <span className={`text-xs ${tab === id ? "opacity-80" : "opacity-60"}`}>{count}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "live" && <LivePanel sessionId={session.id} />}
        {tab === "practice" && <PracticePanel sessionId={session.id} questions={practice} />}
        {tab === "history" && <HistoryPanel sessionId={session.id} questions={questions} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live                                                                */
/* ------------------------------------------------------------------ */

function useStreamedAnswer(sessionId: string) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(
    async (question: string, questionId?: string) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setText("");
      setError(null);
      setStreaming(true);
      try {
        await streamAnswer({ sessionId, question, questionId }, (chunk) => setText((t) => t + chunk), ctrl.signal);
        router.refresh();
      } catch (e) {
        setError(toAiError(e));
      } finally {
        if (abort.current === ctrl) setStreaming(false);
      }
    },
    [sessionId, router],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
    setStreaming(false);
  }, []);

  return { text, streaming, error, run, stop };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost px-2.5 py-1.5 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function AnswerCard({ text, streaming, label = "Suggested answer" }: { text: string; streaming: boolean; label?: string }) {
  return (
    <div className="card overflow-hidden" aria-live="polite" aria-busy={streaming}>
      <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-4 py-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {streaming ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <Sparkles className="size-3.5 text-accent" />}
          {label}
        </span>
        {!streaming && text && <CopyButton text={text} />}
      </div>
      <div className="p-4 sm:p-5">
        {text ? (
          <Markdown text={text} />
        ) : (
          <div className="space-y-2" aria-hidden>
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-surface-2" />
          </div>
        )}
      </div>
    </div>
  );
}

function LivePanel({ sessionId }: { sessionId: string }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const { text, streaming, error, run, stop } = useStreamedAnswer(sessionId);

  const submit = () => {
    const q = question.trim();
    if (!q || streaming) return;
    setAsked(q);
    setQuestion("");
    run(q);
  };

  return (
    <div className="space-y-5">
      <form
        className="card p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="live-q" className="label">What did the interviewer ask?</label>
        <textarea
          id="live-q"
          rows={3}
          className="input resize-none"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. Tell me about a time you disagreed with your manager."
          maxLength={5000}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <MicButton onText={(t) => setQuestion((q) => (q ? `${q} ${t}` : t))} />
          <div className="ml-auto flex gap-2">
            {streaming && (
              <button type="button" onClick={stop} className="btn-secondary">
                <Square className="size-3.5" /> Stop
              </button>
            )}
            <button type="submit" disabled={!question.trim() || streaming} className="btn-primary">
              <Send className="size-4" /> Get answer
            </button>
          </div>
        </div>
        <p className="mt-2 hidden text-xs text-muted sm:block">Enter to send · Shift+Enter for a new line</p>
      </form>

      {asked && (
        <div className="space-y-3">
          <p className="flex gap-2 text-sm font-medium">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>{asked}</span>
          </p>
          {error ? (
            <ErrorNotice error={error} onRetry={() => run(asked)} retrying={streaming} />
          ) : (
            <AnswerCard text={text} streaming={streaming} />
          )}
        </div>
      )}

      {!asked && (
        <p className="px-1 text-center text-sm text-muted">
          Answers use only what&apos;s in your resume and the job description. Anything missing appears as a{" "}
          <span className="font-mono text-fg">[placeholder]</span> for you to fill in.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Practice                                                            */
/* ------------------------------------------------------------------ */

function PracticePanel({ sessionId, questions }: { sessionId: string; questions: Question[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      await postJson("/api/questions", { sessionId, count: 5 });
      router.refresh();
    } catch (e) {
      setError(toAiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex-1">
          <p className="font-semibold">Practise likely questions</p>
          <p className="text-sm text-muted">Generated from the job description and your resume.</p>
        </div>
        <button type="button" onClick={generate} disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {loading ? "Generating…" : questions.length ? "5 more questions" : "Generate questions"}
        </button>
      </div>

      {error && <ErrorNotice error={error} onRetry={generate} retrying={loading} />}

      {questions.map((q, i) => (
        <PracticeQuestion key={q.id} sessionId={sessionId} question={q} defaultOpen={i === 0 && !q.answers?.length} />
      ))}
    </div>
  );
}

function PracticeQuestion({ sessionId, question, defaultOpen }: { sessionId: string; question: Question; defaultOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [latest, setLatest] = useState<Answer | null>(null);
  const suggested = useStreamedAnswer(sessionId);
  const [showSuggested, setShowSuggested] = useState(false);

  const answers = question.answers ?? [];
  const shown = latest ?? answers[0] ?? null;
  const best = answers.reduce<number | null>((m, a) => (a.score && (!m || a.score > m) ? a.score : m), null);

  const getFeedback = async () => {
    if (!draft.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { answer } = await postJson<{ answer: Answer }>("/api/feedback", { questionId: question.id, answer: draft });
      setLatest(answer);
      setDraft("");
      router.refresh();
    } catch (e) {
      setError(toAiError(e));
    } finally {
      setLoading(false);
    }
  };

  const suggestedText = suggested.text || suggested.streaming ? suggested.text : question.suggested_answer ?? "";

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left sm:p-5"
        aria-expanded={open}
      >
        <MessageSquareText className="mt-0.5 size-5 shrink-0 text-accent" />
        <span className="flex-1 font-medium leading-snug">{question.question}</span>
        {best && <ScoreBadge score={best} />}
        <ChevronDown className={`mt-0.5 size-5 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4 sm:p-5">
          <div>
            <label htmlFor={`a-${question.id}`} className="label">Your answer</label>
            <textarea
              id={`a-${question.id}`}
              rows={5}
              className="input resize-y"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Answer as you would out loud…"
              maxLength={20000}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <MicButton onText={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} />
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={suggested.streaming}
                  onClick={() => {
                    setShowSuggested(true);
                    if (!question.suggested_answer && !suggested.text) suggested.run(question.question, question.id);
                  }}
                >
                  <Sparkles className="size-4" /> Suggested answer
                </button>
                <button type="button" onClick={getFeedback} disabled={!draft.trim() || loading} className="btn-primary">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {loading ? "Reviewing…" : "Get feedback"}
                </button>
              </div>
            </div>
          </div>

          {error && <ErrorNotice error={error} onRetry={getFeedback} retrying={loading} />}

          {showSuggested &&
            (suggested.error ? (
              <ErrorNotice
                error={suggested.error}
                onRetry={() => suggested.run(question.question, question.id)}
                retrying={suggested.streaming}
              />
            ) : (
              <AnswerCard text={suggestedText} streaming={suggested.streaming} />
            ))}

          {shown?.feedback && <FeedbackView answer={shown} />}

          {answers.length > 1 && (
            <p className="text-xs text-muted">
              {answers.length} attempts · scores {answers.map((a) => a.score ?? "–").reverse().join(" → ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 8 ? "bg-success-soft text-success" : score >= 5 ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>{score}/10</span>;
}

function FeedbackView({ answer }: { answer: Answer }) {
  const fb = answer.feedback!;
  return (
    <div className="card space-y-4 bg-surface-2/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <ScoreBadge score={fb.score} />
        <p className="text-sm leading-relaxed">{fb.summary}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FbList title="What worked" items={fb.strengths} tone="text-success" />
        <FbList title="To improve" items={fb.improvements} tone="text-warn" />
      </div>
      {fb.resume_conflicts.length > 0 && <FbList title="Not backed by your resume" items={fb.resume_conflicts} tone="text-danger" />}
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-accent">
          <span className="inline-flex items-center gap-1">
            Improved version <ChevronDown className="size-4 transition group-open:rotate-180" />
          </span>
        </summary>
        <div className="mt-3 rounded-xl border border-border bg-surface p-4">
          <Markdown text={fb.improved_answer} />
        </div>
      </details>
      <details>
        <summary className="cursor-pointer text-xs text-muted">Your answer</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{answer.content}</p>
      </details>
    </div>
  );
}

function FbList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-fg/90">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

function HistoryPanel({ sessionId, questions }: { sessionId: string; questions: Question[] }) {
  const [pending, start] = useTransition();
  if (!questions.length) {
    return <div className="card p-10 text-center text-sm text-muted">Questions you ask or practise will appear here.</div>;
  }
  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <details key={q.id} className="card group overflow-hidden">
          <summary className="flex cursor-pointer list-none items-start gap-3 p-4 sm:p-5">
            <span
              className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${
                q.source === "live" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"
              }`}
            >
              {q.source}
            </span>
            <span className="flex-1 font-medium leading-snug">{q.question}</span>
            <ChevronDown className="mt-0.5 size-5 shrink-0 text-muted transition group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-border p-4 sm:p-5">
            {q.suggested_answer ? (
              <Markdown text={q.suggested_answer} />
            ) : (
              <p className="text-sm text-muted">No suggested answer yet.</p>
            )}
            {!!q.answers?.length && (
              <p className="text-xs text-muted">
                {q.answers.length} practice attempt{q.answers.length > 1 ? "s" : ""} · best{" "}
                {Math.max(...q.answers.map((a) => a.score ?? 0))}/10
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted">{new Date(q.created_at).toLocaleString()}</span>
              <div className="flex gap-1">
                {q.suggested_answer && <CopyButton text={q.suggested_answer} />}
                <button
                  type="button"
                  disabled={pending}
                  className="btn-danger px-2.5 py-1.5 text-xs"
                  onClick={() => {
                    if (confirm("Delete this question?")) start(() => deleteQuestion(q.id, sessionId));
                  }}
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
