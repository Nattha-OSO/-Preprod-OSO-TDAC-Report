-- ============================================================
--  migration-email-log.sql — บันทึกอีเมลทุกฉบับที่ระบบส่ง (เมนู "อีเมลที่ส่งออก" ของ admin)
--  เขียนโดย Edge Functions (service_role) เท่านั้น · อ่านได้เฉพาะ role=admin
--  Run: Supabase Dashboard -> SQL Editor (รันซ้ำได้)
-- ============================================================
create table if not exists public.email_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  fn         text not null,                 -- send-report | send-public-report
  status     text not null,                 -- sent | failed | blocked
  actor      text,                          -- อีเมลผู้ส่ง (null = ฟอร์มสาธารณะ)
  recipients text,
  subject    text,
  filenames  text,
  message    text,
  error      text
);
create index if not exists email_log_created_idx on public.email_log (created_at desc);
alter table public.email_log enable row level security;
drop policy if exists "email_log admin read" on public.email_log;
create policy "email_log admin read" on public.email_log for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
-- ไม่มี policy insert/update/delete: anon/authenticated แก้หรือลบประวัติไม่ได้
