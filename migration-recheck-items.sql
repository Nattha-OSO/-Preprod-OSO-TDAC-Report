-- ============================================================
-- migration-recheck-items.sql — รองรับสถานะ "รอตรวจซ้ำ" ระดับรายการย่อย
-- (เช่น System✓ Network✓ แต่ RustDesk ยังไม่ได้ตรวจ → กลับมาตรวจซ้ำ)
-- รันใน: Supabase SQL Editor (project preprod: hxjdaueduibkasokawqx) — รันครั้งเดียว, รันซ้ำได้
-- ============================================================

-- (รวมส่วนของฟีเจอร์รูปภาพไว้ด้วย เผื่อยังไม่ได้รัน migration-photos.sql — รันไฟล์เดียวจบ)
insert into storage.buckets (id, name, public) values ('report-photos','report-photos', true)
  on conflict (id) do update set public = true;
drop policy if exists "report-photos upload" on storage.objects;
create policy "report-photos upload" on storage.objects for insert to anon, authenticated with check (bucket_id='report-photos');
drop policy if exists "report-photos read" on storage.objects;
create policy "report-photos read" on storage.objects for select to anon, authenticated using (bucket_id='report-photos');
drop policy if exists "report-photos delete" on storage.objects;
create policy "report-photos delete" on storage.objects for delete to authenticated using (bucket_id='report-photos');
alter table public.reports        add column if not exists issue_photos      jsonb not null default '[]'::jsonb;
alter table public.reports        add column if not exists web_pc_photos     jsonb not null default '[]'::jsonb;
alter table public.reports        add column if not exists web_mobile_photos jsonb not null default '[]'::jsonb;
alter table public.report_kiosks  add column if not exists remark_photos     jsonb not null default '[]'::jsonb;

-- คอลัมน์เก็บรายการย่อยที่ "รอตรวจซ้ำ" (เช่น ["rustdesk"]) ต่อ 1 เครื่อง
alter table public.report_kiosks add column if not exists recheck_items jsonb not null default '[]'::jsonb;

-- อัปเดต RPC ให้บันทึก recheck_items ด้วย (ต่อยอดจาก migration-photos.sql)
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
  pend int := coalesce((payload->>'kiosks_pending')::int, 0);
  v_date    date := (payload->>'report_date')::date;
  v_shift   text := nullif(btrim(payload->>'shift'),'');
  v_officer text := nullif(btrim(payload->>'officer'),'');
  v_pct     int  := case when tot>0 then round(rdy::numeric/tot*100) else 0 end;
begin
  select id into rid from public.reports
    where report_date=v_date and shift is not distinct from v_shift and officer is not distinct from v_officer
    order by id desc limit 1;

  if rid is null then
    insert into public.reports(
      report_date, shift, officer, inspect_start, inspect_end,
      web_pc_ready, web_pc_remark, web_mobile_ready, web_mobile_remark,
      issue_log, issue_photos, web_pc_photos, web_mobile_photos,
      kiosks_total, kiosks_ready, kiosks_pending, readiness_pct, submitted_by)
    values(
      v_date, v_shift, v_officer,
      nullif(btrim(payload->>'inspect_start'),''), nullif(btrim(payload->>'inspect_end'),''),
      coalesce((payload->>'web_pc_ready')::boolean,false),     nullif(btrim(payload->>'web_pc_remark'),''),
      coalesce((payload->>'web_mobile_ready')::boolean,false), nullif(btrim(payload->>'web_mobile_remark'),''),
      nullif(btrim(payload->>'issue_log'),''),
      coalesce(payload->'issue_photos','[]'::jsonb),
      coalesce(payload->'web_pc_photos','[]'::jsonb),
      coalesce(payload->'web_mobile_photos','[]'::jsonb),
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
      issue_photos=coalesce(payload->'issue_photos','[]'::jsonb),
      web_pc_photos=coalesce(payload->'web_pc_photos','[]'::jsonb),
      web_mobile_photos=coalesce(payload->'web_mobile_photos','[]'::jsonb),
      kiosks_total=tot, kiosks_ready=rdy, kiosks_pending=pend, readiness_pct=v_pct
    where id=rid;
    delete from public.report_kiosks where report_id=rid;
  end if;

  for k in select * from jsonb_array_elements(coalesce(payload->'kiosks','[]'::jsonb)) loop
    insert into public.report_kiosks(report_id, kiosk_id, system_ready, rustdesk_ready, network_ready, occupied, recheck_at, remark, remark_photos, recheck_items)
    values(
      rid, k->>'kiosk_id',
      coalesce((k->>'system_ready')::boolean,false),
      coalesce((k->>'rustdesk_ready')::boolean,false),
      coalesce((k->>'network_ready')::boolean,false),
      coalesce((k->>'occupied')::boolean,false),
      nullif(btrim(k->>'recheck_at'),''),
      nullif(btrim(k->>'remark'),''),
      coalesce(k->'remark_photos','[]'::jsonb),
      coalesce(k->'recheck_items','[]'::jsonb));
  end loop;

  return rid;
end $$;

revoke all on function public.submit_tdac_report(jsonb) from public;
grant execute on function public.submit_tdac_report(jsonb) to anon, authenticated;

-- ตรวจผล:
select column_name from information_schema.columns
where table_name='report_kiosks' and column_name='recheck_items';
