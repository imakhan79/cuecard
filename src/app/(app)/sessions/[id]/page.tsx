import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import type { InterviewSession, Question } from "@/lib/types";
import { Workspace } from "./workspace";

export const metadata: Metadata = { title: "Interview" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase } = await getUser();
  const [{ data: session }, { data: questions }, { data: resumes }, { data: mocks }] = await Promise.all([
    supabase
      .from("interview_sessions")
      .select("id, title, company, role, job_description, meeting_url, resume_id, created_at")
      .eq("id", id)
      .maybeSingle<InterviewSession>(),
    supabase
      .from("questions")
      .select("id, session_id, source, question, suggested_answer, created_at, answers(id, question_id, content, score, feedback, created_at)")
      .eq("session_id", id)
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "answers", ascending: false })
      .returns<Question[]>(),
    supabase.from("resumes").select("id, title").order("updated_at", { ascending: false }),
    supabase
      .from("mock_interviews")
      .select("id, kind, question_count, status, overall_score, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!session) notFound();
  const resumeTitle = resumes?.find((r) => r.id === session.resume_id)?.title ?? null;

  return (
    <Workspace
      session={session}
      questions={questions ?? []}
      resumes={resumes ?? []}
      resumeTitle={resumeTitle}
      mocks={mocks ?? []}
    />
  );
}
