"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Search, Sparkles } from "lucide-react";
import { ErrorNotice } from "@/components/error-notice";
import { Markdown } from "@/components/markdown";
import { AiRequestError, streamAnswer } from "@/lib/ai/client";
import type { AiError } from "@/lib/ai/errors";
import { QUESTION_BANK } from "@/lib/question-bank";

type Gen = { text: string; streaming: boolean; error: AiError | null };

export function QuestionBank({ sessions }: { sessions: { id: string; title: string }[] }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Gen>>({});

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(QUESTION_BANK).flatMap(([cat, qs]) =>
      category !== "All" && cat !== category ? [] : qs.filter((x) => !q || x.toLowerCase().includes(q)).map((x) => ({ cat, q: x })),
    );
  }, [category, query]);

  const generate = async (question: string) => {
    if (!sessionId) return;
    setAnswers((a) => ({ ...a, [question]: { text: "", streaming: true, error: null } }));
    let text = "";
    try {
      await streamAnswer({ sessionId, question }, (c) => {
        text += c;
        setAnswers((a) => ({ ...a, [question]: { text, streaming: true, error: null } }));
      });
      setAnswers((a) => ({ ...a, [question]: { text, streaming: false, error: null } }));
    } catch (e) {
      setAnswers((a) => ({
        ...a,
        [question]: { text: "", streaming: false, error: e instanceof AiRequestError ? e.error : { code: "unknown", message: "Couldn't generate an answer." } },
      }));
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="card space-y-3 p-4">
        {sessions.length ? (
          <label className="block">
            <span className="label">Tailor answers to</span>
            <select className="input" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
        ) : (
          <p className="text-sm text-muted">
            <Link href="/dashboard" className="font-medium text-accent underline">Create an interview</Link> (company, role, resume) to get sample answers tailored to you.
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search questions…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["All", ...Object.keys(QUESTION_BANK)].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${category === c ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-fg"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {items.map(({ cat, q }) => {
          const gen = answers[q];
          const isOpen = open === q;
          return (
            <div key={q} className="card overflow-hidden">
              <button type="button" onClick={() => setOpen(isOpen ? null : q)} className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={isOpen}>
                <span className="flex-1">
                  <span className="block font-medium leading-snug">{q}</span>
                  <span className="text-xs text-muted">{cat}</span>
                </span>
                <ChevronDown className={`mt-0.5 size-5 shrink-0 text-muted transition ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-border p-4">
                  {!gen && (
                    <button type="button" disabled={!sessionId} onClick={() => void generate(q)} className="btn-primary">
                      <Sparkles className="size-4" /> Generate sample answer
                    </button>
                  )}
                  {gen?.error && <ErrorNotice error={gen.error} onRetry={() => void generate(q)} />}
                  {gen && !gen.error && (gen.text ? <Markdown text={gen.text} /> : <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin text-accent" /> Writing…</p>)}
                  {gen && !gen.streaming && !gen.error && (
                    <button type="button" onClick={() => void generate(q)} className="btn-ghost px-2 py-1 text-xs">Regenerate</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!items.length && <p className="p-6 text-center text-sm text-muted">No questions match.</p>}
      </div>
    </div>
  );
}
