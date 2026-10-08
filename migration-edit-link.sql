-- ============================================================
-- migration-edit-link.sql — ลิงก์แก้ไขรายงานในอีเมล (เปิดรายงานเดิมกลับมาแก้ได้จากทุกเครื่อง)
-- รันใน: Supabase SQL Editor (Preprod ก่อน) — เพิ่มอย่างเดียว รันซ้ำได้ ไม่แก้/ลบข้อมูลเดิม
-- ต้องรัน migration-recheck-items.sql มาก่อน (ใช้ฟังก์ชัน submit_tdac_report เดิม)
--
-- หลักการความปลอดภัย
--  * โทเค็นสุ่ม 244 บิต สร้างฝั่งฐานข้อมูล ส่งให้ผู้ส่งรายงานครั้งเดียวตอนส่ง (ไปกับลิงก์ในอีเมล)
--  * ฐานข้อมูลเก็บเฉพาะ "แฮช" ของโทเค็น — คนที่อ่านตาราง reports ได้ก็เอาโทเค็นกลับไม่ได้
--  * ลิงก์หมดอายุ 7 วัน (ต่ออายุอีก 7 วันทุกครั้งที่บันทึกการแก้ไขสำเร็จ)
--  * แก้ได้เฉพาะรายงานของโทเค็นนั้น และ "วันที่ / รอบ / ผู้ตรวจ" เปลี่ยนผ่านลิงก์ไม่ได้
--  * ส่งรายงานใหม่ซ้ำ (วันที่+รอบ+ผู้ตรวจเดียวกัน) = ออกโทเค็นใหม่ ลิงก์เก่าใช้ไม่ได้
--  * ข้อความผิดพลาดเหมือนกันทุกกรณี (ไม่บอกว่ามีรายงานนี้อยู่หรือไม่)
-- ============================================================

alter table public.reports add column if not exists edit_token_hash    text;
alter table public.reports add column if not exists edit_token_expires timestamptz;
alter table public.reports add column if not exists last_link_edit_at   timestamptz;

-- ---------- 1) ส่งรายงานใหม่ + ออกโทเค็น (ห่อฟังก์ชันเดิม ไม่แก้ submit_tdac_report) ----------
create or replace function public.submit_tdac_report_v2(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rid bigint;
  tok text;
  exp timestamptz := now() + interval '7 days';
begin
  rid := public.submit_tdac_report(payload);
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.reports
     set edit_token_hash    = encode(sha256(convert_to(tok, 'UTF8')), 'hex'),
         edit_token_expires = exp
   where id = rid;
  return jsonb_build_object('id', rid, 'token', tok, 'expires', exp);
end $$;

-- ---------- 2) อ่านรายงานเพื่อแก้ไข (ต้องมีโทเค็นที่ถูกต้องและยังไม่หมดอายุ) ----------
create or replace function public.get_tdac_report_for_edit(p_id bigint, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.reports;
begin
  select * into r
    from public.reports
   where id = p_id
     and edit_token_hash is not null
     and edit_token_expires > now()
     and edit_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then
    raise exception 'ลิงก์แก้ไขไม่ถูกต้องหรือหมดอายุ' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'report',  to_jsonb(r) - 'edit_token_hash' - 'edit_token_expires' - 'last_link_edit_at' - 'submitted_by',
    'kiosks',  coalesce((select jsonb_agg(to_jsonb(k) order by k.kiosk_id)
                           from public.report_kiosks k where k.report_id = r.id), '[]'::jsonb),
    'expires', r.edit_token_expires);
end $$;

-- ---------- 3) บันทึกการแก้ไขผ่านลิงก์ (แก้เฉพาะรายงานของโทเค็น, ล็อก วันที่/รอบ/ผู้ตรวจ) ----------
create or replace function public.update_tdac_report_by_token(p_id bigint, p_token text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r   public.reports;
  k   jsonb;
  rdy  int := coalesce((payload->>'kiosks_ready')::int, 0);
  tot  int := coalesce((payload->>'kiosks_total')::int, 20);
  pend int := coalesce((payload->>'kiosks_pending')::int, 0);
  v_pct int := case when coalesce((payload->>'kiosks_total')::int, 20) > 0
                    then round(rdy::numeric / coalesce((payload->>'kiosks_total')::int, 20) * 100) else 0 end;
  exp  timestamptz := now() + interval '7 days';
begin
  select * into r
    from public.reports
   where id = p_id
     and edit_token_hash is not null
     and edit_token_expires > now()
     and edit_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found then
    raise exception 'ลิงก์แก้ไขไม่ถูกต้องหรือหมดอายุ' using errcode = '28000';
  end if;

  if (payload->>'report_date')::date is distinct from r.report_date
     or nullif(btrim(payload->>'shift'), '')   is distinct from r.shift
     or nullif(btrim(payload->>'officer'), '') is distinct from r.officer then
    raise exception 'วันที่ รอบ และผู้ตรวจ แก้ผ่านลิงก์ไม่ได้' using errcode = '22023';
  end if;

  update public.reports set
    inspect_start     = nullif(btrim(payload->>'inspect_start'), ''),
    inspect_end       = nullif(btrim(payload->>'inspect_end'), ''),
    web_pc_ready      = coalesce((payload->>'web_pc_ready')::boolean, false),
    web_pc_remark     = nullif(btrim(payload->>'web_pc_remark'), ''),
    web_mobile_ready  = coalesce((payload->>'web_mobile_ready')::boolean, false),
    web_mobile_remark = nullif(btrim(payload->>'web_mobile_remark'), ''),
    issue_log         = nullif(btrim(payload->>'issue_log'), ''),
    issue_photos      = coalesce(payload->'issue_photos', '[]'::jsonb),
    web_pc_photos     = coalesce(payload->'web_pc_photos', '[]'::jsonb),
    web_mobile_photos = coalesce(payload->'web_mobile_photos', '[]'::jsonb),
    kiosks_total = tot, kiosks_ready = rdy, kiosks_pending = pend, readiness_pct = v_pct,
    edit_token_expires = exp,
    last_link_edit_at  = now()
  where id = p_id;

  delete from public.report_kiosks where report_id = p_id;
  for k in select * from jsonb_array_elements(coalesce(payload->'kiosks', '[]'::jsonb)) loop
    insert into public.report_kiosks(report_id, kiosk_id, system_ready, rustdesk_ready, network_ready,
                                     occupied, recheck_at, remark, remark_photos, recheck_items)
    values(
      p_id, k->>'kiosk_id',
      coalesce((k->>'system_ready')::boolean, false),
      coalesce((k->>'rustdesk_ready')::boolean, false),
      coalesce((k->>'network_ready')::boolean, false),
      coalesce((k->>'occupied')::boolean, false),
      nullif(btrim(k->>'recheck_at'), ''),
      nullif(btrim(k->>'remark'), ''),
      coalesce(k->'remark_photos', '[]'::jsonb),
      coalesce(k->'recheck_items', '[]'::jsonb));
  end loop;

  return jsonb_build_object('id', p_id, 'expires', exp);
end $$;

revoke all on function public.submit_tdac_report_v2(jsonb)                   from public;
revoke all on function public.get_tdac_report_for_edit(bigint, text)         from public;
revoke all on function public.update_tdac_report_by_token(bigint, text, jsonb) from public;
grant execute on function public.submit_tdac_report_v2(jsonb)                   to anon, authenticated;
grant execute on function public.get_tdac_report_for_edit(bigint, text)         to anon, authenticated;
grant execute on function public.update_tdac_report_by_token(bigint, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- ตรวจผล: ต้องได้ 3 แถว
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('submit_tdac_report_v2', 'get_tdac_report_for_edit', 'update_tdac_report_by_token')
 order by 1;
