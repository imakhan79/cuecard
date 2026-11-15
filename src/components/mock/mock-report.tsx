import { CheckCircle2, ChevronDown, MessageCircle, TrendingUp } from "lucide-react";
import type { MockReport } from "@/lib/types";

const SIGNAL: Record<MockReport["hire_signal"], { label: string; tone: string }> = {
  strong_yes: { label: "Strong hire", tone: "bg-success-soft text-success" },
  yes: { label: "Hire", tone: "bg-success-soft text-success" },
  lean_no: { label: "Leaning no hire", tone: "bg-warn-soft text-warn" },
  no: { label: "No hire", tone: "bg-danger-soft text-danger" },
};

function tone(score: number) {
  return score >= 8 ? "text-success" : score >= 5 ? "text-warn" : "text-danger";
}

export function MockReportView({ report }: { report: MockReport }) {
  const signal = SIGNAL[report.hire_signal];
  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex size-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-accent/30 bg-accent-soft">
          <span className={`text-3xl font-bold ${tone(report.overall_score)}`}>{report.overall_score}</span>
          <span className="text-xs text-muted">out of 10</span>
        </div>
        <div className="min-w-0 flex-1">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${signal.tone}`}>{signal.label}</span>
          <p className="mt-2 leading-relaxed">{report.summary}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-success"><CheckCircle2 className="size-4" /> Strengths</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div className="card p-5">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-warn"><TrendingUp className="size-4" /> To improve</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">{report.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>

      <div className="card p-5">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent"><MessageCircle className="size-4" /> Communication</p>
        <p className="text-sm leading-relaxed">{report.communication}</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Question by question</h2>
        {report.questions.map((q, i) => (
          <details key={i} className="card group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-start gap-3 p-4 sm:p-5">
              <span className={`w-10 shrink-0 text-lg font-bold ${tone(q.score)}`}>{q.score}<span className="text-xs font-normal text-muted">/10</span></span>
              <span className="flex-1 font-medium leading-snug">{q.question}</span>
              <ChevronDown className="mt-0.5 size-5 shrink-0 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-border p-4 text-sm sm:p-5">
              <p className="leading-relaxed">{q.feedback}</p>
              <div className="rounded-xl bg-surface-2 p-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Stronger answer</p>
                <p className="whitespace-pre-wrap leading-relaxed">{q.model_answer}</p>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
