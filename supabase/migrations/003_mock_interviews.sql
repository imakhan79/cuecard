-- Mock interviews with an AI voice interviewer. Safe to re-run.
create table if not exists public.mock_interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  kind text not null check (kind in ('behavioral', 'technical', 'mixed')),
  question_count smallint not null check (question_count between 2 and 12),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  -- [{ "role": "interviewer" | "candidate", "text": "...", "at": "iso date" }]
  transcript jsonb not null default '[]'::jsonb,
  report jsonb,
  overall_score smallint check (overall_score between 1 and 10),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists mock_interviews_user_id_idx on public.mock_interviews (user_id);
create index if not exists mock_interviews_session_id_idx on public.mock_interviews (session_id, created_at desc);

alter table public.mock_interviews enable row level security;

drop policy if exists "mock_interviews_all_own" on public.mock_interviews;
create policy "mock_interviews_all_own" on public.mock_interviews
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.interview_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );

revoke all on public.mock_interviews from anon;
grant select, insert, update, delete on public.mock_interviews to authenticated;
