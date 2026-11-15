"use client";

import { AlertTriangle, KeyRound, RotateCw, Timer, WifiOff } from "lucide-react";
import { AI_ERROR_TITLES, type AiError } from "@/lib/ai/errors";

const ICONS = {
  invalid_key: KeyRound,
  rate_limit: Timer,
  network: WifiOff,
} as const;

export function ErrorNotice({
  error,
  onRetry,
  retrying,
}: {
  error: AiError;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const Icon = ICONS[error.code as keyof typeof ICONS] ?? AlertTriangle;
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 sm:flex-row sm:items-center"
    >
      <Icon className="size-5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger">{AI_ERROR_TITLES[error.code]}</p>
        <p className="mt-0.5 text-sm text-fg/80">{error.message}</p>
      </div>
      {onRetry && error.code !== "unauthorized" && (
        <button type="button" onClick={onRetry} disabled={retrying} className="btn-secondary shrink-0">
          <RotateCw className={`size-4 ${retrying ? "animate-spin" : ""}`} aria-hidden />
          Retry
        </button>
      )}
      {error.code === "unauthorized" && (
        <a href="/login" className="btn-secondary shrink-0">
          Sign in
        </a>
      )}
    </div>
  );
}
