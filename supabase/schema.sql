-- Cuecard database schema
-- Run this once in the Supabase SQL editor (or with psql). It is safe to re-run.
-- Every table has Row Level Security enabled: each user can only see and change their own rows.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created automatically on sign-up
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- resumes: the user's resume text (the only source of facts about them)
-- ---------------------------------------------------------------------------
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resumes_user_id_idx on public.resumes (user_id);

-- ---------------------------------------------------------------------------
-- interview_sessions: one interview (company, role, job description, resume)
-- ---------------------------------------------------------------------------
create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  resume_id uuid references public.resumes (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  company text,
  role text,
  job_description text check (char_length(job_description) <= 50000),
  meeting_url text check (meeting_url is null or char_length(meeting_url) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists interview_sessions_user_id_idx on public.interview_sessions (user_id);
create index if not exists interview_sessions_resume_id_idx on public.interview_sessions (resume_id);

-- ---------------------------------------------------------------------------
-- questions: interview questions, either asked live or generated for practice,
-- with Claude's suggested answer
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  source text not null,
  question text not null check (char_length(question) between 1 and 5000),
  suggested_answer text,
  created_at timestamptz not null default now()
);
-- live = typed/dictated, practice = generated, copilot = detected from meeting audio
alter table public.questions drop constraint if exists questions_source_check;
alter table public.questions
  add constraint questions_source_check check (source in ('live', 'practice', 'copilot'));
alter table public.interview_sessions
  add column if not exists meeting_url text check (meeting_url is null or char_length(meeting_url) <= 2000);
create index if not exists questions_user_id_idx on public.questions (user_id);
create index if not exists questions_session_id_idx on public.questions (session_id, created_at);

-- ---------------------------------------------------------------------------
-- answers: the user's own practice answers, with Claude's feedback
-- ---------------------------------------------------------------------------
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 20000),
  score smallint check (score between 1 and 10),
  feedback jsonb,
  created_at timestamptz not null default now()
);
create index if not exists answers_user_id_idx on public.answers (user_id);
create index if not exists answers_question_id_idx on public.answers (question_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- resumes
drop policy if exists "resumes_all_own" on public.resumes;
create policy "resumes_all_own" on public.resumes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- interview_sessions (a linked resume must also belong to the user)
drop policy if exists "sessions_all_own" on public.interview_sessions;
create policy "sessions_all_own" on public.interview_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      resume_id is null
      or exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = (select auth.uid()))
    )
  );

-- questions (the parent session must belong to the user)
drop policy if exists "questions_all_own" on public.questions;
create policy "questions_all_own" on public.questions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.interview_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );

-- answers (the parent question must belong to the user)
drop policy if exists "answers_all_own" on public.answers;
create policy "answers_all_own" on public.answers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = question_id and q.user_id = (select auth.uid()))
  );

-- Anonymous visitors get nothing.
revoke all on public.profiles, public.resumes, public.interview_sessions, public.questions, public.answers from anon;
grant select, insert, update, delete on public.resumes, public.interview_sessions, public.questions, public.answers to authenticated;
grant select, update on public.profiles to authenticated;
