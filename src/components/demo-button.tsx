"use client";

import { useState, useTransition } from "react";
import { Loader2, Zap } from "lucide-react";
import { signInDemo } from "@/app/(auth)/demo-actions";

export function DemoButton({ className = "btn-secondary w-full py-3", label = "Try the demo, no sign-up" }: { className?: string; label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await signInDemo();
            if (res?.error) setError(res.error);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
        {pending ? "Opening demo…" : label}
      </button>
      {error && <p role="alert" className="text-center text-sm text-danger">{error}</p>}
    </div>
  );
}
