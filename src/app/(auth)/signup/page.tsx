import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Free to start. Your data stays private to you.</p>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
