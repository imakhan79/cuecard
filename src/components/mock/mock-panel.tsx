"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { ChevronRight, Headset, Loader2, Trash2 } from "lucide-react";
import { deleteMock, startMock } from "@/app/(app)/actions";
import type { MockInterview } from "@/lib/types";

const KINDS = [
  { id: "mixed", label: "Mixed", hint: "Like a real first round" },
  { id: "behavioral", label: "Behavioural", hint: "Teamwork, conflict, impact" },
  { id: "technical", label: "Role-specific", hint: "Skills from the job post" },
  { id: "coding", label: "Coding", hint: "Talk through algorithms" },
  { id: "system_design", label: "System design", hint: "Architecture & trade-offs" },
  { id: "product_case", label: "Product case", hint: "Product sense & metrics" },
  { id: "case_study", label: "Case study", hint: "Consulting-style business case" },
  { id: "salary_negotiation", label: "Salary negotiation", hint: "Role-play the offer call" },
] as const;

export function MockPanel({
  sessionId,
  mocks,
  canRedrill = false,
}: {
  canRedrill?: boolean;
  sessionId: string;
  mocks: Pick<MockInterview, "id" | "kind" | "question_count" | "status" | "overall_score" | "created_at">[];
}) {
  const [state, action, pending] = useActionState(startMock, undefined);
  const [deleting, startDelete] = useTransition();

  return (
    <div className="space-y-5">
      <form action={action} className="card space-y-5 p-5 sm:p-6">
        <input type="hidden" name="session_id" value={sessionId} />
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Headset className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Mock interview with an AI interviewer</p>
            <p className="text-sm text-muted">
              A spoken practice interview: the interviewer asks questions out loud, listens to your spoken answers,
              asks follow-ups, then gives you a scored report.
            </p>
          </div>
        </div>

        <fieldset>
          <legend className="label">Interview type</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map((k, i) => (
              <label key={k.id} className="flex cursor-pointer flex-col rounded-xl border border-border p-3 transition has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" name="kind" value={k.id} defaultChecked={i === 0} className="sr-only" />
                <span className="text-sm font-semibold">{k.label}</span>
                <span className="text-xs text-muted">{k.hint}</span>
              </label>
            ))}
            <label className={`col-span-2 flex flex-col rounded-xl border border-dashed p-3 transition sm:col-span-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft ${canRedrill ? "cursor-pointer border-accent/50" : "cursor-not-allowed border-border opacity-60"}`}>
              <input type="radio" name="kind" value="redrill" disabled={!canRedrill} className="sr-only" />
              <span className="text-sm font-semibold">Re-drill weak spots</span>
              <span className="text-xs text-muted">
                {canRedrill ? "Replays the weak spots from your debriefs, mock reports and low practice scores." : "Unlocks after a debrief, a finished mock, or a low practice score."}
              </span>
            </label>
          </div>
        </fieldset>

        <div>
          <label htmlFor="question_count" className="label">Length</label>
          <select id="question_count" name="question_count" defaultValue="5" className="input sm:w-56">
            <option value="3">Quick: 3 questions (~10 min)</option>
            <option value="5">Standard: 5 questions (~20 min)</option>
            <option value="8">Full: 8 questions (~35 min)</option>
          </select>
        </div>

        {state?.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Headset className="size-4" />}
          Start mock interview
        </button>
        <p className="text-xs text-muted">Best in Chrome or Edge with headphones. You can also type your answers.</p>
      </form>

      {mocks.length > 0 && (
        <div className="space-y-2">
          <h3 className="px-1 text-sm font-semibold text-muted">Past mock interviews</h3>
          {mocks.map((m) => (
            <div key={m.id} className="card flex items-center gap-3 p-3 sm:p-4">
              <Link href={`/mock/${m.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className={`grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold ${
                  m.overall_score == null ? "bg-surface-2 text-muted" : m.overall_score >= 8 ? "bg-success-soft text-success" : m.overall_score >= 5 ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"
                }`}>
                  {m.overall_score ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold capitalize">{m.kind} · {m.question_count} questions</span>
                  <span className="block text-xs text-muted">
                    {new Date(m.created_at).toLocaleString()} · {m.status === "completed" ? "Report ready" : "In progress, tap to resume"}
                  </span>
                </span>
                <ChevronRight className="size-5 text-muted" />
              </Link>
              <button
                type="button"
                disabled={deleting}
                className="btn-danger size-9 p-0"
                aria-label="Delete mock interview"
                onClick={() => {
                  if (confirm("Delete this mock interview?")) startDelete(() => deleteMock(m.id, sessionId));
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
