"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronDown, Loader2, Radio } from "lucide-react";
import { PLATFORM_LABEL, detectPlatform } from "@/lib/meeting";
import { startLiveInterview } from "../actions";

export function LiveLauncher({ resumes }: { resumes: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState(startLiveInterview, undefined);
  const [url, setUrl] = useState("");
  const [showJd, setShowJd] = useState(false);
  const platform = detectPlatform(url);

  return (
    <form action={action} className="card mt-6 space-y-4 p-5 sm:p-6">
      <div>
        <label htmlFor="meeting_url" className="label">Meeting link</label>
        <input
          id="meeting_url"
          name="meeting_url"
          type="url"
          inputMode="url"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://zoom.us/j/… · https://teams.microsoft.com/… · https://meet.google.com/…"
        />
        <p className="mt-1.5 text-xs text-muted">
          {platform ? <>Detected: <b className="text-fg">{PLATFORM_LABEL[platform]}</b></> : "Optional. You can still share any call's tab or screen."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="company" className="label">Company</label>
          <input id="company" name="company" maxLength={200} className="input" placeholder="Acme Inc." />
        </div>
        <div>
          <label htmlFor="role" className="label">Role</label>
          <input id="role" name="role" maxLength={200} className="input" placeholder="Senior Product Manager" />
        </div>
      </div>

      <div>
        <label htmlFor="resume_id" className="label">Resume</label>
        <select id="resume_id" name="resume_id" className="input" defaultValue={resumes[0]?.id ?? ""}>
          <option value="">No resume (answers will use placeholders)</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select>
        {!resumes.length && (
          <p className="mt-1.5 text-xs text-warn">
            <Link href="/resumes" className="font-medium underline">Add your resume</Link> first for answers based on your real experience.
          </p>
        )}
      </div>

      <div>
        <button type="button" onClick={() => setShowJd((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-accent" aria-expanded={showJd}>
          {showJd ? "Hide" : "Add"} job description <span className="font-normal text-muted">(recommended)</span>
          <ChevronDown className={`size-4 transition ${showJd ? "rotate-180" : ""}`} />
        </button>
        {showJd && (
          <textarea name="job_description" rows={6} maxLength={50000} className="input mt-2 resize-y" placeholder="Paste the job posting…" />
        )}
      </div>

      {state?.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-base">
        {pending ? <Loader2 className="size-5 animate-spin" /> : <Radio className="size-5" />}
        Launch live assistant
      </button>
    </form>
  );
}
