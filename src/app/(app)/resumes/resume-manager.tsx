"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { ErrorNotice } from "@/components/error-notice";
import { AiRequestError, postJson } from "@/lib/ai/client";
import type { AiError } from "@/lib/ai/errors";
import type { Resume } from "@/lib/types";
import { deleteResume, saveResume } from "../actions";

export function ResumeManager({ resumes }: { resumes: Resume[] }) {
  const [editing, setEditing] = useState<Resume | "new" | null>(resumes.length ? null : "new");
  const [deleting, startDelete] = useTransition();

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <button type="button" onClick={() => setEditing("new")} className="btn-primary w-full">
          <Plus className="size-4" /> Add resume
        </button>
        {resumes.map((r) => (
          <div
            key={r.id}
            className={`card flex items-center gap-3 p-3 ${editing !== "new" && editing?.id === r.id ? "border-accent" : ""}`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{r.title}</p>
              <p className="text-xs text-muted">Updated {new Date(r.updated_at).toLocaleDateString()}</p>
            </div>
            <button type="button" onClick={() => setEditing(r)} className="btn-ghost size-9 p-0" aria-label={`Edit ${r.title}`}>
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (!confirm(`Delete "${r.title}"? Interviews using it will keep working without a resume.`)) return;
                startDelete(async () => {
                  await deleteResume(r.id);
                  if (editing !== "new" && editing?.id === r.id) setEditing(null);
                });
              }}
              className="btn-danger size-9 p-0"
              aria-label={`Delete ${r.title}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {editing ? (
        <ResumeEditor
          key={editing === "new" ? "new" : editing.id}
          resume={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : (
        <div className="card hidden items-center justify-center p-10 text-sm text-muted lg:flex">
          Select a resume to edit, or add a new one.
        </div>
      )}
    </div>
  );
}

function ResumeEditor({ resume, onClose }: { resume?: Resume; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(saveResume, undefined);
  const [content, setContent] = useState(resume?.content ?? "");
  const [title, setTitle] = useState(resume?.title ?? "");
  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<AiError | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok && !resume) onClose();
  }, [state, resume, onClose]);

  async function importFile(file: File) {
    setLastFile(file);
    setUploadError(null);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setExtracting(true);
      try {
        const form = new FormData();
        form.append("file", new File([file], file.name, { type: "application/pdf" }));
        const { text } = await postJson<{ text: string }>("/api/resume-extract", form);
        setContent(text);
      } catch (e) {
        setUploadError(e instanceof AiRequestError ? e.error : { code: "unknown", message: "Couldn't read that PDF." });
      } finally {
        setExtracting(false);
      }
    } else {
      setContent(await file.text());
    }
  }

  return (
    <form action={formAction} className="card space-y-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{resume ? "Edit resume" : "New resume"}</h2>
          <p className="text-sm text-muted">Paste the text, or upload a PDF, .txt or .md file.</p>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost size-9 p-0" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      {resume && <input type="hidden" name="id" value={resume.id} />}
      <div>
        <label htmlFor="r-title" className="label">Name</label>
        <input id="r-title" name="title" required maxLength={200} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product Manager resume, 2026" />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="r-content" className="label mb-0">Resume text</label>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={extracting} className="btn-secondary px-3 py-1.5 text-xs">
            {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {extracting ? "Reading PDF…" : "Upload file"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = "";
            }}
          />
        </div>
        <textarea
          id="r-content"
          name="content"
          required
          rows={18}
          maxLength={100000}
          className="input resize-y font-mono text-[13px] leading-relaxed"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"Alex Morgan\nSenior Product Manager\n\nEXPERIENCE\nAcme Inc. — Product Manager (2022–present)\n- Led …"}
          disabled={extracting}
        />
      </div>

      {uploadError && (
        <ErrorNotice
          error={uploadError}
          retrying={extracting}
          onRetry={lastFile ? () => importFile(lastFile) : undefined}
        />
      )}
      {state?.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && resume && <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">Saved.</p>}

      <button type="submit" disabled={pending || extracting} className="btn-primary w-full sm:w-auto">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Save resume
      </button>
    </form>
  );
}
