import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoButton } from "@/components/demo-button";
import { AuthForm } from "../auth-form";
import { isDemoEnabled } from "../demo-actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const demo = await isDemoEnabled();
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Sign in to your interview prep.</p>
      {demo && (
        <>
          <DemoButton />
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            or sign in with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
