"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Link2, Loader2, Pencil, X } from "lucide-react";
import { setMeetingUrl } from "@/app/(app)/actions";
import { PLATFORM_LABEL, detectPlatform } from "@/lib/meeting";

/** Shows the interview's meeting link with Join, and lets the user add or change it in place. */
export function MeetingLink({ sessionId, initialUrl }: { sessionId: string; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [editing, setEditing] = useState(!initialUrl);
  const [draft, setDraft] = useState(initialUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const platform = detectPlatform(url);
  const draftPlatform = detectPlatform(draft);

  const save = () =>
    startSave(async () => {
      setError(null);
      const res = await setMeetingUrl(sessionId, draft);
      if (res.error) return setError(res.error);
      setUrl(res.url ?? null);
      setEditing(!res.url);
    });

  return (
    <div className="card p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Meeting link</p>

      {editing ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                type="url"
                inputMode="url"
                autoFocus={!!initialUrl}
                className="input pl-9"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste your Zoom, Microsoft Teams or Google Meet link"
                aria-label="Meeting link"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving || !draft.trim()} className="btn-primary flex-1 sm:flex-none">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save link
              </button>
              {url && (
                <button type="button" className="btn-secondary px-3" aria-label="Cancel" onClick={() => { setDraft(url); setEditing(false); setError(null); }}>
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted">
            {draftPlatform ? <>Detected: <b className="text-fg">{PLATFORM_LABEL[draftPlatform]}</b></> : "e.g. https://meet.google.com/abc-defg-hij · https://zoom.us/j/123… · https://teams.microsoft.com/l/meetup-join/…"}
          </p>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </form>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 truncate font-medium">
            {PLATFORM_LABEL[platform ?? "other"]} · <span className="text-muted">{url}</span>
          </p>
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost px-3" aria-label="Change meeting link">
            <Pencil className="size-4" /> <span className="sm:hidden">Change</span>
          </button>
          <a href={url!} target="_blank" rel="noopener noreferrer" className="btn-primary">
            <ExternalLink className="size-4" /> Join {platform && platform !== "other" ? PLATFORM_LABEL[platform] : "meeting"}
          </a>
        </div>
      )}
    </div>
  );
}
