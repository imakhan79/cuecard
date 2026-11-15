import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewContext } from "@/lib/ai/prompts";

export type SessionRow = {
  id: string;
  title: string;
  company: string | null;
  role: string | null;
  job_description: string | null;
  resume_id: string | null;
  interview_type: string | null;
  created_at: string;
};

/** Loads a session and its resume. RLS guarantees it belongs to the signed-in user. */
export async function loadInterviewContext(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ session: SessionRow; context: InterviewContext } | null> {
  const { data: session } = await supabase
    .from("interview_sessions")
    .select("id, title, company, role, job_description, resume_id, interview_type, created_at")
    .eq("id", sessionId)
    .maybeSingle<SessionRow>();
  if (!session) return null;

  let resume: string | null = null;
  if (session.resume_id) {
    const { data } = await supabase
      .from("resumes")
      .select("content")
      .eq("id", session.resume_id)
      .maybeSingle<{ content: string }>();
    resume = data?.content ?? null;
  }

  return {
    session,
    context: {
      resume,
      company: session.company,
      role: session.role,
      jobDescription: session.job_description,
      interviewType: session.interview_type,
    },
  };
}

/** Joins the text blocks of a Claude response. */
export function textOf(content: ReadonlyArray<{ type: string; text?: string }>) {
  return content
    .flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : []))
    .join("");
}
