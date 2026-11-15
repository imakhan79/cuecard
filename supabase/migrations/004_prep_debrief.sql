-- Interview formats, prep checklist, debriefs, more mock scenarios. Safe to re-run.

alter table public.interview_sessions
  add column if not exists interview_type text not null default 'general',
  add column if not exists prep jsonb,
  add column if not exists prep_checked jsonb not null default '[]'::jsonb;

alter table public.interview_sessions drop constraint if exists interview_sessions_interview_type_check;
alter table public.interview_sessions add constraint interview_sessions_interview_type_check
  check (interview_type in ('general', 'behavioral', 'technical', 'coding', 'system_design', 'case_study', 'one_way_video'));

alter table public.mock_interviews drop constraint if exists mock_interviews_kind_check;
alter table public.mock_interviews add constraint mock_interviews_kind_check
  check (kind in ('behavioral', 'technical', 'mixed', 'coding', 'system_design', 'product_case', 'case_study', 'salary_negotiation', 'redrill'));

-- Debriefs: plain-language readiness reports after a live or practice session
create table if not exists public.debriefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  source text not null check (source in ('live', 'practice')),
  readiness smallint check (readiness between 1 and 10),
  report jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists debriefs_user_id_idx on public.debriefs (user_id);
create index if not exists debriefs_session_id_idx on public.debriefs (session_id, created_at desc);

alter table public.debriefs enable row level security;
drop policy if exists "debriefs_all_own" on public.debriefs;
create policy "debriefs_all_own" on public.debriefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.interview_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );
revoke all on public.debriefs from anon;
grant select, insert, update, delete on public.debriefs to authenticated;
