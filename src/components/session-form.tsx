"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { ActionState } from "@/app/(app)/actions";
import type { InterviewSession, Resume } from "@/lib/types";

export function SessionForm({
  action,
  resumes,
  session,
  submitLabel,
  onSaved,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  resumes: Pick<Resume, "id" | "title">[];
  session?: InterviewSession;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      {session && <input type="hidden" name="id" value={session.id} />}
      <div>
        <label htmlFor="title" className="label">Interview name</label>
        <input id="title" name="title" required maxLength={200} className="input" defaultValue={session?.title} placeholder="Acme: Senior Frontend, round 2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="company" className="label">Company</label>
          <input id="company" name="company" maxLength={200} className="input" defaultValue={session?.company ?? ""} placeholder="Acme Inc." />
        </div>
        <div>
          <label htmlFor="role" className="label">Role</label>
          <input id="role" name="role" maxLength={200} className="input" defaultValue={session?.role ?? ""} placeholder="Senior Frontend Engineer" />
        </div>
      </div>
      <div>
        <label htmlFor="meeting_url" className="label">Meeting link <span className="font-normal text-muted">(Zoom, Teams or Google Meet, optional)</span></label>
        <input id="meeting_url" name="meeting_url" type="url" inputMode="url" maxLength={2000} className="input" defaultValue={session?.meeting_url ?? ""} placeholder="https://meet.google.com/abc-defg-hij" />
      </div>
      <div>
        <label htmlFor="resume_id" className="label">Resume</label>
        <select id="resume_id" name="resume_id" className="input" defaultValue={session?.resume_id ?? resumes[0]?.id ?? ""}>
          <option value="">No resume (answers will use placeholders)</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select>
        {resumes.length === 0 && (
          <p className="mt-1.5 text-xs text-muted">
            <Link href="/resumes" className="font-medium text-accent hover:underline">Add a resume</Link> so answers can use your real experience.
          </p>
        )}
      </div>
      <div>
        <label htmlFor="job_description" className="label">Job description</label>
        <textarea id="job_description" name="job_description" rows={6} maxLength={50000} className="input resize-y" defaultValue={session?.job_description ?? ""} placeholder="Paste the job posting here…" />
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}
