-- Cuecard demo account (optional). Run after schema.sql. Safe to re-run.
-- Creates demo@cuecard.app / CuecardDemo2026! with a sample resume and interview,
-- and locks the account's email and password so visitors can't take it over.

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  demo_id uuid;
  demo_email text := 'demo@cuecard.app';
  demo_password text := 'CuecardDemo2026!';
  resume_id uuid;
begin
  select id into demo_id from auth.users where email = demo_email;

  if demo_id is null then
    demo_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', demo_id, 'authenticated', 'authenticated', demo_email,
      extensions.crypt(demo_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Demo User"}', now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), demo_id, demo_id::text,
      jsonb_build_object('sub', demo_id::text, 'email', demo_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  -- Sample data (only if the demo account has none).
  if not exists (select 1 from public.resumes where user_id = demo_id) then
    insert into public.resumes (user_id, title, content) values (demo_id, 'Sample resume: Product Manager', $resume$Jordan Lee
Product Manager · jordan.lee@example.com · London, UK

SUMMARY
Product manager with 5 years' experience shipping B2B SaaS features, from discovery to launch.

EXPERIENCE
Brightpath Software — Product Manager (2022–present)
- Owned the onboarding flow for a project-management tool used by 1,200 business customers.
- Led a redesign of self-serve onboarding that raised 30-day activation from 41% to 55%.
- Ran 20+ customer interviews per quarter and turned findings into a prioritised roadmap.
- Worked with a team of 6 engineers and 1 designer in two-week sprints.

Northwind Analytics — Associate Product Manager (2020–2022)
- Shipped a CSV import tool that cut support tickets about data upload by 35%.
- Wrote PRDs and acceptance criteria; ran weekly backlog grooming.
- Introduced a feature-request tagging system in Zendesk to quantify demand.

EDUCATION
BSc Economics, University of Leeds (2019)

SKILLS
Product discovery, A/B testing, SQL, Amplitude, Figma, Jira, stakeholder management$resume$)
    returning id into resume_id;

    insert into public.interview_sessions (user_id, resume_id, title, company, role, job_description)
    values (
      demo_id, resume_id, 'Acme Cloud: Senior PM (demo)', 'Acme Cloud', 'Senior Product Manager',
      'Acme Cloud is hiring a Senior Product Manager to own activation and onboarding for our collaboration platform. You will: lead discovery with customers, define and track activation metrics, partner with engineering and design to ship experiments weekly, and communicate roadmap trade-offs to leadership. Requirements: 4+ years in B2B SaaS product management, strong data skills (SQL, product analytics), experience running A/B tests, excellent stakeholder communication.'
    );
  end if;
end $$;

-- Keep the shared demo account usable: block changes to its email and password.
create or replace function public.protect_demo_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email = 'demo@cuecard.app' then
    new.email := old.email;
    new.encrypted_password := old.encrypted_password;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_demo_user on auth.users;
create trigger protect_demo_user
  before update on auth.users
  for each row execute function public.protect_demo_user();
