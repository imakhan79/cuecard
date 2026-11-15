import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronRight, MessageSquareText } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { SessionForm } from "@/components/session-form";
import { createSession } from "../actions";

export const metadata: Metadata = { title: "Interviews" };

type Row = {
  id: string;
  title: string;
  company: string | null;
  role: string | null;
  created_at: string;
  questions: { count: number }[];
};

export default async function DashboardPage() {
  const { supabase } = await getUser();
  const [{ data: sessions }, { data: resumes }] = await Promise.all([
    supabase
      .from("interview_sessions")
      .select("id, title, company, role, created_at, questions(count)")
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    supabase.from("resumes").select("id, title").order("updated_at", { ascending: false }),
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your interviews</h1>
        <p className="mt-1 text-muted">Open an interview to get live answers or practise.</p>

        <div className="mt-6 space-y-3">
          {!sessions?.length && (
            <div className="card flex flex-col items-center px-6 py-12 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Briefcase className="size-6" />
              </span>
              <p className="mt-4 font-medium">No interviews yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted">Create one with the company, role and job description to get started.</p>
            </div>
          )}
          {sessions?.map((s) => (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className="card group flex items-center gap-4 p-4 transition hover:border-accent/50 sm:p-5"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted group-hover:bg-accent-soft group-hover:text-accent">
                <Briefcase className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.title}</p>
                <p className="truncate text-sm text-muted">
                  {[s.role, s.company].filter(Boolean).join(" · ") || "No role details"}
                </p>
              </div>
              <span className="hidden items-center gap-1.5 text-sm text-muted sm:inline-flex">
                <MessageSquareText className="size-4" />
                {s.questions?.[0]?.count ?? 0}
              </span>
              <ChevronRight className="size-5 text-muted transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>

      <aside className="card h-fit p-5 sm:p-6 lg:sticky lg:top-24">
        <h2 className="text-lg font-semibold">New interview</h2>
        <p className="mb-5 mt-1 text-sm text-muted">The more context you give, the better the answers.</p>
        <SessionForm action={createSession} resumes={resumes ?? []} submitLabel="Create interview" />
      </aside>
    </div>
  );
}
