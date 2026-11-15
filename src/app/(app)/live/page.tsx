import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Radio } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { PLATFORM_LABEL, detectPlatform } from "@/lib/meeting";
import { LiveLauncher } from "./live-launcher";

export const metadata: Metadata = { title: "Live Interview" };

export default async function LivePage() {
  const { supabase } = await getUser();
  const [{ data: resumes }, { data: recent }] = await Promise.all([
    supabase.from("resumes").select("id, title").order("updated_at", { ascending: false }),
    supabase
      .from("interview_sessions")
      .select("id, title, meeting_url, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-fg">
          <Radio className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Live Interview Assistance</h1>
          <p className="text-sm text-muted">Real-time answers during your Zoom, Microsoft Teams or Google Meet interview.</p>
        </div>
      </div>

      <ol className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
        {["Paste your meeting link and pick your resume", "Join the call, then share its tab or screen with Cuecard", "Answers appear automatically as the interviewer asks"].map((s, i) => (
          <li key={i} className="card flex items-start gap-2.5 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <LiveLauncher resumes={resumes ?? []} />

      {!!recent?.length && (
        <div className="mt-8 space-y-2">
          <h2 className="px-1 text-sm font-semibold text-muted">Or go live with an existing interview</h2>
          {recent.map((s) => {
            const p = detectPlatform(s.meeting_url);
            return (
              <Link key={s.id} href={`/live/${s.id}`} className="card group flex items-center gap-3 p-3 transition hover:border-accent/50 sm:p-4">
                <Radio className="size-4 text-muted group-hover:text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block text-xs text-muted">{p ? PLATFORM_LABEL[p] : "No meeting link"}</span>
                </span>
                <ChevronRight className="size-5 text-muted" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
