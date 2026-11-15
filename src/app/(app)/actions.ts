"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: boolean } | undefined;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

// ---------- Resumes ----------

const ResumeInput = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Give your resume a name.").max(200),
  content: z.string().trim().min(20, "Paste your resume text (at least a few lines).").max(100000),
});

export async function saveResume(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = ResumeInput.safeParse({
    id: form.get("id") || undefined,
    title: form.get("title"),
    content: form.get("content"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireUser();
  const { id, ...fields } = parsed.data;

  const { error } = id
    ? await supabase.from("resumes").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("resumes").insert({ ...fields, user_id: user.id });
  if (error) return { error: "Couldn't save the resume. Please try again." };

  revalidatePath("/resumes");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteResume(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("resumes").delete().eq("id", z.uuid().parse(id));
  revalidatePath("/resumes");
  revalidatePath("/dashboard");
}

// ---------- Interview sessions ----------

const SessionInput = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "Give the interview a name.").max(200),
  company: opt(200),
  role: opt(200),
  job_description: opt(50000),
  resume_id: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
});

function sessionFields(form: FormData) {
  return SessionInput.safeParse({
    id: form.get("id") || undefined,
    title: form.get("title"),
    company: form.get("company"),
    role: form.get("role"),
    job_description: form.get("job_description"),
    resume_id: form.get("resume_id") ?? "",
  });
}

export async function createSession(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = sessionFields(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireUser();
  const fields = { ...parsed.data, id: undefined };

  const { data, error } = await supabase
    .from("interview_sessions")
    .insert({ ...fields, user_id: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't create the interview. Please try again." };

  revalidatePath("/dashboard");
  redirect(`/sessions/${data.id}`);
}

export async function updateSession(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = sessionFields(form);
  if (!parsed.success || !parsed.data.id) return { error: parsed.error?.issues[0].message ?? "Missing id." };
  const { supabase } = await requireUser();
  const { id, ...fields } = parsed.data;

  const { error } = await supabase.from("interview_sessions").update(fields).eq("id", id);
  if (error) return { error: "Couldn't save changes. Please try again." };

  revalidatePath(`/sessions/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteSession(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("interview_sessions").delete().eq("id", z.uuid().parse(id));
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function deleteQuestion(id: string, sessionId: string) {
  const { supabase } = await requireUser();
  await supabase.from("questions").delete().eq("id", z.uuid().parse(id));
  revalidatePath(`/sessions/${sessionId}`);
}

// ---------- Auth ----------

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
