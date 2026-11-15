import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to your interview prep.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
