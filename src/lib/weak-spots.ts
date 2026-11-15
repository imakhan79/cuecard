import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Debrief, MockReport } from "@/lib/types";

/** Weak spots for Re-drill: from recent debriefs, mock reports, and low-scoring practice answers. */
export async function loadWeakSpots(supabase: SupabaseClient, sessionId: string): Promise<string[]> {
  const [{ data: debriefs }, { data: mocks }, { data: low }] = await Promise.all([
    supabase.from("debriefs").select("report").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(3),
    supabase
      .from("mock_interviews")
      .select("report")
      .eq("session_id", sessionId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("answers")
      .select("score, questions!inner(question, session_id)")
      .eq("questions.session_id", sessionId)
      .lte("score", 6)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const spots: string[] = [];
  for (const d of debriefs ?? []) spots.push(...((d.report as Debrief | null)?.weak_spots ?? []));
  for (const m of mocks ?? []) {
    const r = m.report as MockReport | null;
    spots.push(...(r?.improvements ?? []));
    for (const q of r?.questions ?? []) if (q.score <= 6) spots.push(`Weak answer (${q.score}/10) to: ${q.question}`);
  }
  for (const a of low ?? []) {
    const q = (a as unknown as { score: number; questions: { question: string } }).questions;
    if (q?.question) spots.push(`Low practice score (${(a as { score: number }).score}/10) on: ${q.question}`);
  }
  return [...new Set(spots)].slice(0, 12);
}

/** Whether there is anything to re-drill yet. */
export async function hasWeakSpots(supabase: SupabaseClient, sessionId: string) {
  return (await loadWeakSpots(supabase, sessionId)).length > 0;
}
