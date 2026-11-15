import { ArrowRight, CheckCircle2, Target } from "lucide-react";
import type { Debrief } from "@/lib/types";

function tone(n: number) {
  return n >= 7 ? "text-success" : n >= 5 ? "text-warn" : "text-danger";
}

/** Plain-language interview debrief: readiness, what worked, weak spots, next steps. */
export function DebriefView({ debrief }: { debrief: Debrief }) {
  return (
    <div className="card space-y-5 p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-full border-4 border-accent/30 bg-accent-soft">
          <span className={`text-2xl font-bold ${tone(debrief.readiness)}`}>{debrief.readiness}</span>
          <span className="text-[10px] text-muted">readiness</span>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Interview debrief</p>
          <p className="mt-1 leading-relaxed">{debrief.summary}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle2 className="size-4" /> What worked</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{debrief.worked.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-warn"><Target className="size-4" /> Weak spots to fix</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{debrief.weak_spots.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>
      {debrief.next_steps.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-accent"><ArrowRight className="size-4" /> Next round</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{debrief.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      <p className="text-xs text-muted">Weak spots feed the <b>Re-drill</b> mock interview in the Mock tab.</p>
    </div>
  );
}
