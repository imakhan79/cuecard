import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Radio } from "lucide-react";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { getUser } from "@/lib/supabase/server";
import type { InterviewSession } from "@/lib/types";

export const metadata: Metadata = { title: "Live Interview" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase } = await getUser();
  const { data: session } = await supabase
    .from("interview_sessions")
    .select("id, title, company, role, job_description, meeting_url, resume_id, created_at")
    .eq("id", id)
    .maybeSingle<InterviewSession>();
  if (!session) notFound();

  const { data: resume } = session.resume_id
    ? await supabase.from("resumes").select("title").eq("id", session.resume_id).maybeSingle<{ title: string }>()
    : { data: null };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/live" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" /> Live Interview
        </Link>
        <Link href={`/sessions/${session.id}`} className="ml-auto text-sm text-muted hover:text-fg">
          Interview details &amp; history →
        </Link>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
          <Radio className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{session.title}</h1>
          <p className={`flex items-center gap-1 text-sm ${resume ? "text-muted" : "text-warn"}`}>
            <FileText className="size-3.5" /> {resume?.title ?? "No resume linked, so answers will use placeholders"}
          </p>
        </div>
      </div>
      <div className="mt-6">
        <CopilotPanel sessionId={session.id} meetingUrl={session.meeting_url} />
      </div>
    </div>
  );
}
