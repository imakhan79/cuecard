"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "confirm" ? "That confirmation link is invalid or expired. Try signing in." : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(safeNext);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() || null },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/dashboard");
          router.refresh();
        } else {
          setNotice("Check your inbox for a confirmation link, then sign in.");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg === "Failed to fetch" ? "Couldn't reach the server. Check your connection." : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" && (
        <div>
          <label htmlFor="name" className="label">Name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Alex Morgan" />
        </div>
      )}
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input
          id="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
        />
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{notice}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading && <Loader2 className="size-4 animate-spin" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>New to Cuecard? <Link href="/signup" className="font-medium text-accent hover:underline">Create an account</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
