"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { quickSaveResume } from "@/app/(app)/actions";
import { AiRequestError, postJson } from "@/lib/ai/client";

/**
 * Upload a resume (PDF, Word .docx, .txt, .md) from anywhere: extracts the text,
 * saves it to the user's resumes, and reports the new resume back.
 */
export function ResumeUpload({
  onUploaded,
  label = "Upload resume",
  className = "btn-secondary",
}: {
  onUploaded: (resume: { id: string; title: string }) => void;
  label?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    setBusy(true);
    setError(null);
    try {
      const name = file.name.toLowerCase();
      let text: string;
      if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
        text = await file.text();
      } else {
        const form = new FormData();
        form.append("file", file);
        ({ text } = await postJson<{ text: string }>("/api/resume-extract", form));
      }
      const title = file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "My resume";
      const res = await quickSaveResume(title, text);
      if (res.error || !res.id) throw new Error(res.error ?? "Couldn't save the resume.");
      onUploaded({ id: res.id, title });
    } catch (e) {
      setError(e instanceof AiRequestError ? e.error.message : e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className={className}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? "Reading resume…" : label}
      </button>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
          e.target.value = "";
        }}
      />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
