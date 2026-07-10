-- ============================================================
--  OSO-TDAC Operational Report — Supabase schema
--  วิธีใช้: Supabase Dashboard -> SQL Editor -> วางทั้งหมด -> Run
--  (idempotent: รันซ้ำได้ ไม่ทำลายข้อมูลเดิม)
-- ============================================================

-- ============================================================
--  1) ทะเบียนชื่อเจ้าหน้าที่ Onsite Support (ผู้ตรวจสอบ)
--     แทน dropdown ที่ฮาร์ดโค้ดในฟอร์มเดิม — จัดการผ่านเมนู "จัดการรายชื่อ"
-- ============================================================
create table if not exists public.officers (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  active     boolean not null default true,
  email      text,                              -- อีเมลรับรายงาน PDF อัตโนมัติจากฟอร์มสาธารณะ
  created_at timestamptz not null default now()
);
-- เผื่อตารางถูกสร้างไว้ก่อนมีคอลัมน์ email (รันซ้ำได้)
alter table public.officers add column if not exists email text;

-- ============================================================
--  2) รายงานการตรวจสอบ (1 แถว = 1 การตรวจสอบ 1 รอบ)
-- ============================================================
create table if not exists public.reports (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  report_date       date    not null,                 -- วันที่ตรวจสอบ
  shift             text    not null,                 -- 'IMP/D 10:00' | 'IMP/N 22:00'
  officer           text    not null,                 -- ชื่อ OSO ผู้ตรวจสอบ
  inspect_start     text,                             -- เวลาเริ่มตรวจ 'HH:MM' (default ตามรอบ 10:00/22:00)
  inspect_end       text,                             -- เวลาตรวจเสร็จ 'HH:MM' (ถึงเวลาเท่าไหร่)
  -- Website / Mobile checklist
  web_pc_ready      boolean not null default false,
  web_pc_remark     text,
  web_mobile_ready  boolean not null default false,
  web_mobile_remark text,
  -- บันทึกปัญหา / ข้อเสนอแนะ จากเจ้าหน้าที่ ตม.
  issue_log         text,
  -- สรุป (denormalized เพื่อความเร็วของแดชบอร์ด/รายงาน — คำนวณตอน insert)
  kiosks_total      smallint not null default 20,
  kiosks_ready      smallint not null default 0,      -- จำนวนเครื่องที่พร้อมครบ 3 รายการ
  kiosks_pending    smallint not null default 0,      -- จำนวนเครื่อง "รอตรวจซ้ำ" (ไม่ว่างตอนไปตรวจ)
  readiness_pct     smallint not null default 0,      -- 0-100 (overall: ready/total)
  submitted_by      text default (auth.jwt() ->> 'email')  -- NULL ถ้าส่งผ่านฟอร์มสาธารณะ (anon)
);
-- เผื่อตารางถูกสร้างไว้ก่อนมีคอลัมน์ใหม่ (รันซ้ำได้)
alter table public.reports add column if not exists kiosks_pending smallint not null default 0;
alter table public.reports add column if not exists inspect_start text;
alter table public.reports add column if not exists inspect_end   text;
create index if not exists reports_date_idx    on public.reports (report_date desc);
create index if not exists reports_created_idx on public.reports (created_at desc);
create index if not exists reports_officer_idx on public.reports (officer);

-- ============================================================
--  3) รายละเอียด Kiosk รายเครื่อง (20 แถวต่อ 1 รายงาน)
--     แยกตารางเพื่อให้วิเคราะห์ "เครื่องไหน Not Ready บ่อย" ได้ง่าย
-- ============================================================
create table if not exists public.report_kiosks (
  id            bigint generated always as identity primary key,
  report_id     bigint not null references public.reports(id) on delete cascade,
  kiosk_id      text   not null,                       -- 'IMM001' .. 'IMM020'
  system_ready  boolean not null default false,
  rustdesk_ready boolean not null default false,
  network_ready boolean not null default false,
  occupied      boolean not null default false,       -- true = เครื่องไม่ว่างตอนไปตรวจ → "รอตรวจซ้ำ"
  recheck_at    text,                                 -- เวลา 'HH:MM' ที่กลับมาตรวจซ้ำ (เครื่องที่เคยไม่ว่าง)
  remark        text,
  unique (report_id, kiosk_id)
);
-- เผื่อตารางถูกสร้างไว้ก่อนมีคอลัมน์ใหม่ (รันซ้ำได้)
alter table public.report_kiosks add column if not exists occupied   boolean not null default false;
alter table public.report_kiosks add column if not exists recheck_at text;
create index if not exists report_kiosks_report_idx on public.report_kiosks (report_id);
create index if not exists report_kiosks_kiosk_idx  on public.report_kiosks (kiosk_id);

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.officers       enable row level security;
alter table public.reports        enable row level security;
alter table public.report_kiosks  enable row level security;

-- ฟอร์มสาธารณะ (anon): ส่งรายงานผ่านฟังก์ชัน submit_tdac_report เท่านั้น (ดูด้านล่าง)
--   ไม่เปิด policy insert ตรง ๆ ให้ anon — เพื่อให้ anon ส่งได้เฉพาะผ่านฟังก์ชันที่ตรวจสอบแล้ว
--   และ "อ่านรายงานไม่ได้" (เฉพาะ role ที่อนุมัติเท่านั้นที่อ่านได้)

-- ผู้ใช้ที่อนุมัติแล้ว (admin/senior/manager): อ่าน/แก้/ลบรายงานได้ทั้งหมด
drop policy if exists "approved read report" on public.reports;
create policy "approved read report" on public.reports for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'));
drop policy if exists "approved modify report" on public.reports;
create policy "approved modify report" on public.reports for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'));

drop policy if exists "approved read report_kiosks" on public.report_kiosks;
create policy "approved read report_kiosks" on public.report_kiosks for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'));
drop policy if exists "approved modify report_kiosks" on public.report_kiosks;
create policy "approved modify report_kiosks" on public.report_kiosks for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'));

-- ทะเบียนชื่อ officers: อ่านได้ทุกคน (เติม dropdown ในฟอร์มสาธารณะ) แก้ได้เฉพาะ role ที่อนุมัติ
drop policy if exists "anyone read officers" on public.officers;
create policy "anyone read officers" on public.officers for select using (true);
drop policy if exists "approved write officers" on public.officers;
create policy "approved write officers" on public.officers for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'));

-- ============================================================
--  ฟังก์ชันส่งรายงานจากฟอร์มสาธารณะ (anon) — atomic: reports + report_kiosks
--  ใช้ SECURITY DEFINER เพื่อให้ anon ส่งได้โดยไม่ต้องเปิดสิทธิ์ insert/select ตรง ๆ
--  (จึงส่งได้อย่างเดียว อ่านรายงานของผู้อื่นไม่ได้)
-- ============================================================
create or replace function public.submit_tdac_report(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  rid bigint;
  k   jsonb;
  rdy  int := coalesce((payload->>'kiosks_ready')::int, 0);
  tot  int := coalesce((payload->>'kiosks_total')::int, 20);
  pend int := coalesce((payload->>'kiosks_pending')::int, 0);   -- เครื่อง "รอตรวจซ้ำ"
  v_date    date := (payload->>'report_date')::date;
  v_shift   text := nullif(btrim(payload->>'shift'),'');
  v_officer text := nullif(btrim(payload->>'officer'),'');
  v_pct     int  := case when tot>0 then round(rdy::numeric/tot*100) else 0 end;
begin
  -- ถ้ามีรายงานของ วันที่+รอบ+ผู้ตรวจ เดิมอยู่แล้ว → อัปเดตทับ (ให้ผู้บันทึกกลับมาแก้/ตรวจซ้ำรายการเดิมได้ ไม่เกิดรายงานซ้ำ)
  select id into rid from public.reports
    where report_date=v_date and shift is not distinct from v_shift and officer is not distinct from v_officer
    order by id desc limit 1;

  if rid is null then
    insert into public.reports(
      report_date, shift, officer, inspect_start, inspect_end,
      web_pc_ready, web_pc_remark, web_mobile_ready, web_mobile_remark,
      issue_log, kiosks_total, kiosks_ready, kiosks_pending, readiness_pct, submitted_by)
    values(
      v_date, v_shift, v_officer,
      nullif(btrim(payload->>'inspect_start'),''), nullif(btrim(payload->>'inspect_end'),''),
      coalesce((payload->>'web_pc_ready')::boolean,false),     nullif(btrim(payload->>'web_pc_remark'),''),
      coalesce((payload->>'web_mobile_ready')::boolean,false), nullif(btrim(payload->>'web_mobile_remark'),''),
      nullif(btrim(payload->>'issue_log'),''),
      tot, rdy, pend, v_pct, null)
    returning id into rid;
  else
    update public.reports set
      inspect_start=nullif(btrim(payload->>'inspect_start'),''),
      inspect_end=nullif(btrim(payload->>'inspect_end'),''),
      web_pc_ready=coalesce((payload->>'web_pc_ready')::boolean,false),
      web_pc_remark=nullif(btrim(payload->>'web_pc_remark'),''),
      web_mobile_ready=coalesce((payload->>'web_mobile_ready')::boolean,false),
      web_mobile_remark=nullif(btrim(payload->>'web_mobile_remark'),''),
      issue_log=nullif(btrim(payload->>'issue_log'),''),
      kiosks_total=tot, kiosks_ready=rdy, kiosks_pending=pend, readiness_pct=v_pct
    where id=rid;
    delete from public.report_kiosks where report_id=rid;   -- แทนที่รายละเอียด Kiosk ทั้งชุด
  end if;

  for k in select * from jsonb_array_elements(coalesce(payload->'kiosks','[]'::jsonb)) loop
    insert into public.report_kiosks(report_id, kiosk_id, system_ready, rustdesk_ready, network_ready, occupied, recheck_at, remark)
    values(
      rid, k->>'kiosk_id',
      coalesce((k->>'system_ready')::boolean,false),
      coalesce((k->>'rustdesk_ready')::boolean,false),
      coalesce((k->>'network_ready')::boolean,false),
      coalesce((k->>'occupied')::boolean,false),
      nullif(btrim(k->>'recheck_at'),''),
      nullif(btrim(k->>'remark'),''));
  end loop;

  return rid;
end $$;

revoke all on function public.submit_tdac_report(jsonb) from public;
grant execute on function public.submit_tdac_report(jsonb) to anon, authenticated;

-- ============================================================
--  เปิด Realtime — ให้แดชบอร์ด/สรุป/รายงานอัปเดตสดเมื่อมีรายงานใหม่
-- ============================================================
do $$
begin
  begin alter publication supabase_realtime add table public.reports;       exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.report_kiosks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.officers;      exception when duplicate_object then null; end;
end $$;

-- ============================================================
--  (ทางเลือก) กันรายงานซ้ำที่ระดับฐานข้อมูล
--    เทียบ: วันที่ + รอบ + ผู้ตรวจ  → 1 รอบ/วัน/คน มีรายงานเดียว
--  ⚠️ ถ้ามีข้อมูลซ้ำอยู่ก่อน ให้ลบให้เหลือรายการเดียวก่อนสร้าง index
-- ============================================================
-- create unique index if not exists reports_dedup_uidx
--   on public.reports (report_date, btrim(shift), btrim(officer));

-- ============================================================
--  ตั้งให้บัญชี officers ทะเบียนเริ่มต้น (จากฟอร์มเดิม 18 ชื่อ)
--  *** ลบทิ้งได้ถ้าจะกรอกเองในเมนูจัดการรายชื่อ ***
-- ============================================================
insert into public.officers (name) values
  ('คุณศิรินทิพย์ วงษ์แจ้ง'),
  ('คุณณัฏฐา บัวศรีจันทร์'),
  ('คุณธีธัช ทีรฆาภิบาล'),
  ('คุณปรทรัพย์ ปรเมธามัย'),
  ('คุณสราลี พนิตนรากุล'),
  ('คุณอิงกร ภู่ประเสริฐ'),
  ('คุณพิมพ์มาดา เฮอร์เบิร์ต'),
  ('คุณภุรดา วงศ์ตระกูลยนต์'),
  ('คุณจักรภัทร โมรา'),
  ('คุณอมฤต นิรันพันธุ์'),
  ('คุณพิพรรธ์ กาญจนพิมาย'),
  ('คุณปวริศ พบหิรัญ'),
  ('คุณณัทกฤช ชาญวุฒิธรรม'),
  ('คุณชัชณรินทร์ ไกรวิทย์'),
  ('คุณนรันดร์ สำราญมนต์'),
  ('คุณเกษมพงศ์ พันธุ์พิพัฒน์'),
  ('คุณธนกร จิตรสุขสม'),
  ('คุณจันทร์จิรา กำแพงจันทร์')
on conflict (name) do nothing;

-- ============================================================
--  ===== ต่อไปนี้ reuse จากระบบ OSO Evaluation (ไม่เปลี่ยน) =====
-- ============================================================

-- ---------- Audit Log (admin อ่านได้คนเดียว) ----------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor      text default (auth.jwt() ->> 'email'),
  action     text not null,
  entity     text,
  detail     text
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists "log insert authed" on public.audit_log;
create policy "log insert authed" on public.audit_log for insert to authenticated with check (true);
drop policy if exists "log read admin" on public.audit_log;
create policy "log read admin" on public.audit_log for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------- App settings (สิทธิ์ + ตารางส่งอีเมลอัตโนมัติ) ----------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "settings read authed" on public.app_settings;
create policy "settings read authed" on public.app_settings for select to authenticated using (true);
drop policy if exists "settings write admin" on public.app_settings;
create policy "settings write admin" on public.app_settings for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
-- ให้ตัวจับเวลา (GitHub Actions) อ่าน "ตารางเวลาส่งรายงาน" แบบ anon ได้ (เฉพาะ key นี้)
drop policy if exists "sched anon read" on public.app_settings;
create policy "sched anon read" on public.app_settings for select to anon
  using (key = 'auto_report_sched');
-- ให้บัญชีบอท (role ที่อนุมัติ) อัปเดต lastSent ได้ เฉพาะ key ตารางเวลา
drop policy if exists "sched role write" on public.app_settings;
create policy "sched role write" on public.app_settings for update to authenticated
  using (key = 'auto_report_sched' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'))
  with check (key = 'auto_report_sched' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','senior','manager'));
do $$ begin
  begin alter publication supabase_realtime add table public.app_settings; exception when duplicate_object then null; end;
end $$;

-- ---------- Profiles (ชื่อที่แสดงของผู้ใช้) ----------
create table if not exists public.profiles (
  email        text primary key,
  display_name text,
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles read authed" on public.profiles;
create policy "profiles read authed" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles write admin" on public.profiles;
create policy "profiles write admin" on public.profiles for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------- Access requests (ลงทะเบียน + อนุมัติ) ----------
create table if not exists public.access_requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  email       text not null,
  full_name   text,
  reason      text,
  status      text not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz
);
create index if not exists access_requests_status_idx on public.access_requests (status, created_at desc);
alter table public.access_requests enable row level security;
drop policy if exists "req admin all" on public.access_requests;
create policy "req admin all" on public.access_requests for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
--  ตั้งบัญชี admin เริ่มต้น (ให้ RLS ด้านบนทำงาน)
--  *** เปลี่ยนอีเมลให้ตรงกับ admin ของคุณ แล้วให้ admin ออก-เข้าระบบใหม่ 1 ครั้ง ***
-- ============================================================
update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
  where email = 'nkneverdie.n@gmail.com';  -- PREPROD: admin ทดสอบ (คนละบัญชีกับ production)
