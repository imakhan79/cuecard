import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import { QuestionBank } from "./question-bank";

export const metadata: Metadata = { title: "Question Bank" };

export default async function QuestionsPage() {
  const { supabase } = await getUser();
  const { data: sessions } = await supabase
    .from("interview_sessions")
    .select("id, title")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Question Bank</h1>
      <p className="mt-1 text-muted">
        Common interview questions with AI sample answers tailored to your resume and the role you pick.
      </p>
      <QuestionBank sessions={sessions ?? []} />
    </div>
  );
}
