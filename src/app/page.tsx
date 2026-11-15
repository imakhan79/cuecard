import Link from "next/link";
import { FileText, MessagesSquare, Mic, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { DemoButton } from "@/components/demo-button";
import { isDemoEnabled } from "./(auth)/demo-actions";

const FEATURES = [
  { icon: Mic, title: "Live answers", body: "Type or speak the interviewer's question and get a spoken-style answer streamed in seconds." },
  { icon: FileText, title: "Grounded in your resume", body: "Answers only use facts from your resume. Anything missing becomes a placeholder, never made up." },
  { icon: Target, title: "Tailored to the role", body: "Paste the job description so every answer and question maps to what they're hiring for." },
  { icon: MessagesSquare, title: "Practice questions", body: "Generate the questions you're most likely to face, based on the role and your background." },
  { icon: Sparkles, title: "Honest feedback", body: "Answer in your own words and get a score, strengths, fixes, and an improved version." },
  { icon: ShieldCheck, title: "Private by design", body: "Row Level Security on every table. Only you can see your resumes, sessions and answers." },
];

export default async function Home() {
  const demo = await isDemoEnabled();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn-primary hidden sm:inline-flex">Get started</Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles className="size-3.5" /> AI interview assistant
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            The right words, <span className="text-accent">on cue.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted text-pretty">
            Cuecard turns your resume and the job description into confident, honest interview answers,
            live or in practice.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary px-6 py-3 text-base">Start preparing</Link>
            {demo ? (
              <DemoButton className="btn-secondary w-full px-6 py-3 text-base sm:w-auto" label="Try the demo" />
            ) : (
              <Link href="/login" className="btn-secondary px-6 py-3 text-base">I have an account</Link>
            )}
          </div>
          {demo && <p className="mt-3 text-sm text-muted">One click, no sign-up: opens a sample account with a resume and interview ready to go.</p>}
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-4 font-semibold">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        Cuecard · Built with Claude
      </footer>
    </div>
  );
}
