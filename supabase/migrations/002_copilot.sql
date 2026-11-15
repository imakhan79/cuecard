-- Copilot: meeting links and auto-detected questions. Safe to re-run.
alter table public.interview_sessions
  add column if not exists meeting_url text check (meeting_url is null or char_length(meeting_url) <= 2000);

alter table public.questions drop constraint if exists questions_source_check;
alter table public.questions
  add constraint questions_source_check check (source in ('live', 'practice', 'copilot'));
