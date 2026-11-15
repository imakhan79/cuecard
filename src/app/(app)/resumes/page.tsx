import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import type { Resume } from "@/lib/types";
import { ResumeManager } from "./resume-manager";

export const metadata: Metadata = { title: "Resumes" };

export default async function ResumesPage() {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("resumes")
    .select("id, title, content, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .returns<Resume[]>();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Resumes</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Cuecard only uses facts from your resume. If something isn&apos;t here, answers will show a
        placeholder for you to fill in instead of inventing it.
      </p>
      <ResumeManager resumes={data ?? []} />
    </div>
  );
}
