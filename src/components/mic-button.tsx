"use client";

import { Mic, MicOff } from "lucide-react";
import { useSpeech } from "./use-speech";

export function MicButton({ onText }: { onText: (text: string) => void }) {
  const { supported, listening, start, stop, error } = useSpeech(onText);
  if (!supported) return null;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        className={`btn size-11 p-0 ${listening ? "bg-danger text-white" : "btn-secondary"}`}
        aria-label={listening ? "Stop voice input" : "Start voice input"}
        aria-pressed={listening}
        title={listening ? "Stop listening" : "Dictate"}
      >
        {listening ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
      </button>
      {listening && <span className="flex items-center gap-1.5 text-xs font-medium text-danger"><span className="size-2 animate-pulse rounded-full bg-danger" />Listening…</span>}
      {error && !listening && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
