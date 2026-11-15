"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { ClipboardList, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { togglePrepItem } from "@/app/(app)/actions";
import { DebriefView } from "@/components/debrief-view";
import { ErrorNotice } from "@/components/error-notice";
import { ResumeUpload } from "@/components/resume-upload";
import { AiRequestError, postJson } from "@/lib/ai/client";
import type { AiError } from "@/lib/ai/errors";
import type { Debrief, InterviewSession } from "@/lib/types";

export type DebriefRow = { id: string; source: string; readiness: number | null; report: Debrief; created_at: string };

const COVERAGE = {
  strong: "bg-success-soft text-success",
  partial: "bg-warn-soft text-warn",
  missing: "bg-danger-soft text-danger",
} as const;

/** Goals & Prep Checklist + readiness debriefs for one interview. */
export function PrepPanel({ session, debriefs }: { session: InterviewSession; debriefs: DebriefRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"prep" | "debrief" | null>(null);
  const [error, setError] = useState<{ err: AiError; retry: () => void } | null>(null);
  const [, startToggle] = useTransition();
  const [checked, setChecked] = useOptimistic(session.prep_checked ?? [], (state: string[], next: string[]) => next);
  const prep = session.prep;

  const call = async (kind: "prep" | "debrief") => {
    setLoading(kind);
    setError(null);
    try {
      if (kind === "prep") await postJson("/api/prep", { sessionId: session.id });
      else await postJson("/api/debrief", { sessionId: session.id, source: "practice" });
      router.refresh();
    } catch (e) {
      setError({ err: e instanceof AiRequestError ? e.error : { code: "unknown", message: "Something went wrong." }, retry: () => void call(kind) });
    } finally {
      setLoading(null);
    }
  };

  const done = prep ? prep.checklist.filter((c) => checked.includes(c.id)).length : 0;

  return (
    <div className="space-y-5">
      {/* Resume quick upload */}
      {!session.resume_id && (
        <div className="card flex flex-col gap-3 border-warn/40 bg-warn-soft/40 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">No resume linked to this interview. Upload one, then link it under <b>Details</b>.</p>
          <ResumeUpload onUploaded={() => router.refresh()} />
        </div>
      )}

      {/* Checklist */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><ClipboardList className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Goals &amp; prep checklist</p>
            <p className="text-sm text-muted">Parses the job description against your resume and lists the prep you&apos;re still missing.</p>
          </div>
          <button type="button" onClick={() => void call("prep")} disabled={loading !== null} className={prep ? "btn-secondary" : "btn-primary"}>
            {loading === "prep" ? <Loader2 className="size-4 animate-spin" /> : prep ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
            {loading === "prep" ? "Analysing…" : prep ? "Rebuild" : "Build my checklist"}
          </button>
        </div>

        {prep && (
          <div className="mt-5 space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold">Checklist</span>
                <span className="text-muted">{done}/{prep.checklist.length} done</span>
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${prep.checklist.length ? (done / prep.checklist.length) * 100 : 0}%` }} />
              </div>
              <ul className="space-y-2">
                {prep.checklist.map((c) => {
                  const isDone = checked.includes(c.id);
                  return (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-surface-2/60">
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={(e) => {
                            const next = e.target.checked ? [...checked, c.id] : checked.filter((x) => x !== c.id);
                            startToggle(async () => {
                              setChecked(next);
                              await togglePrepItem(session.id, c.id, e.target.checked);
                            });
                          }}
                          className="mt-0.5 size-4 accent-[var(--accent)]"
                        />
                        <span className={`flex-1 text-sm ${isDone ? "text-muted line-through" : ""}`}>{c.task}</span>
                        <span className="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{c.category}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Job requirements vs. your resume</p>
              <ul className="space-y-2">
                {prep.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${COVERAGE[r.coverage]}`}>{r.coverage}</span>
                    <span><span className="font-medium">{r.requirement}</span> <span className="text-muted">{r.evidence}</span></span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Likely topics</p>
              <div className="flex flex-wrap gap-2">
                {prep.likely_topics.map((t, i) => <span key={i} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">{t}</span>)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Debriefs */}
      <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex-1">
          <p className="font-semibold">Readiness debrief</p>
          <p className="text-sm text-muted">A plain-language report from your practice answers, mock interviews and live sessions: readiness score, what worked, weak spots.</p>
        </div>
        <button type="button" onClick={() => void call("debrief")} disabled={loading !== null} className="btn-secondary">
          {loading === "debrief" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {loading === "debrief" ? "Writing…" : "New debrief"}
        </button>
      </div>

      {error && <ErrorNotice error={error.err} onRetry={error.retry} />}

      {debriefs.map((d) => (
        <div key={d.id} className="space-y-1">
          <p className="px-1 text-xs text-muted">{d.source === "live" ? "Live session" : "Practice"} debrief · {new Date(d.created_at).toLocaleString()}</p>
          <DebriefView debrief={d.report} />
        </div>
      ))}
    </div>
  );
}
