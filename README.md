# Cuecard

An AI interview assistant built with **Next.js 16** (App Router, TypeScript, Tailwind CSS v4), **Supabase** (auth and Postgres with Row Level Security) and the **Claude API** (`claude-opus-5-5`).

## Features

- **Accounts:** email/password sign-up and sign-in with Supabase Auth. `src/proxy.ts` protects every app page and sends signed-out users to `/login`.
- **Resumes:** paste your resume, or upload a `.txt`/`.md` file or a PDF. Claude transcribes the PDF word for word, on the server.
- **Interviews:** one per interview, holding the company, role, job description and the linked resume.
- **Live answers:** type the interviewer's question, or dictate it with the browser's speech recognition. A spoken-style answer streams back in seconds.
- **Practice:** generates the questions you're most likely to face. You answer in your own words and get a 1–10 score, strengths, things to improve, any claims your resume doesn't back up, and an improved version. A suggested answer is available on demand.
- **History:** every question and answer is saved per interview. You can copy or delete them.
- **No invented resume details:** every prompt treats the resume as the only source of facts about you. Anything missing shows up as a `[placeholder]` for you to fill in.
- **Clear errors:** an invalid API key, a rate limit, a network failure or an overloaded API each shows a specific message with a **Retry** button.
- **Light and dark mode** (follows the system setting, or toggle it), with a mobile-first layout.

## Tech notes

- All Claude calls run on the server (`src/app/api/*`, `src/lib/ai/claude.ts`). The API key never reaches the browser.
- Live answers stream as NDJSON with `output_config: { effort: "low" }`. Questions and feedback use `effort: "medium"` with structured JSON output. No `temperature` or `budget_tokens` is sent.
- The resume and job description are sent as a cached system block (prompt caching), so repeat questions in the same interview are cheaper and faster.
- Server-side refusal fallback (`fallbacks: "default"`) is turned on: if Opus 5.5 declines a request on policy grounds, the API retries on its default fallback model.
- Database tables: `profiles`, `resumes`, `interview_sessions`, `questions`, `answers`. RLS is on for every table, and every policy is scoped to `auth.uid()`. Inserts that reference a parent row (a session, question or resume) also check that you own that parent.

## Setup

### 1. Prerequisites

- Node.js 20.9 or later
- A Supabase project
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

### 2. Install

```bash
git clone https://github.com/imakhan79/cuecard.git
cd cuecard
npm install
```

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to find it |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic Console → API keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key (`sb_publishable_…`). The legacy `anon` key also works. |

### 4. Database

Open the Supabase **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. The script is safe to re-run.

You can also run it with psql (use the Session pooler connection string from Supabase → Connect):

```bash
psql "postgresql://postgres.<project-ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres" -f supabase/schema.sql
```

### 5. Auth settings

In Supabase → **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000` (your production URL once deployed)
- **Redirect URLs:** add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`

If **Confirm email** is on (the default), new users must click the link in their email before they can sign in. To test locally without email, turn it off under Authentication → Providers → Email.

### 6. Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start
```

## Deploying to Vercel

1. Import the GitHub repo into Vercel.
2. Add the three environment variables.
3. Add `https://<your-vercel-domain>/auth/callback` to the Supabase redirect URLs.

## Project layout

```
src/
  proxy.ts                     # auth guard (Next.js 16 Proxy)
  app/
    page.tsx                   # landing page
    (auth)/login, signup       # auth pages
    auth/callback/route.ts     # email-confirmation code exchange
    (app)/dashboard            # interview list + new interview
    (app)/resumes              # resume manager (paste / upload)
    (app)/sessions/[id]        # live, practice and history workspace
    (app)/actions.ts           # server actions (CRUD, sign out)
    api/answer                 # streamed live / suggested answers
    api/questions              # practice question generation
    api/feedback               # answer scoring and feedback
    api/resume-extract         # PDF → text
  lib/
    ai/                        # Claude client, prompts, error mapping, browser helpers
    supabase/                  # browser, server and proxy clients
supabase/schema.sql            # tables, RLS policies, sign-up trigger
```
