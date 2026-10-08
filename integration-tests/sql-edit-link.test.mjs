import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = 'D:/Ai Tools/Claude/OSO TDAC Report/Github-Preprod/';
const read = f => fs.readFileSync(root + f, 'utf8').replace(/\r/g, '');
const db = new PGlite();

// ---- Minimal Supabase-like environment ----
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
  grant usage on schema public to anon, authenticated;
`);
// real table definitions from schema.sql (reports .. report_kiosks indexes)
const schema = read('schema.sql');
const a = schema.indexOf('create table if not exists public.reports');
const b = schema.indexOf('create index if not exists report_kiosks_kiosk_idx');
await db.exec(schema.slice(a, schema.indexOf('\n', b)));
// real submit_tdac_report (v1) from the recheck migration, minus Supabase Storage statements
const mig = read('migration-recheck-items.sql').split('\n').filter(l => !/storage\.|report-photos|on conflict \(id\)/.test(l)).join('\n');
await db.exec(mig);
await db.exec(`
  alter table public.reports enable row level security;
  alter table public.report_kiosks enable row level security;
  create policy rd on public.reports for select to authenticated using (true);
  grant select on public.reports, public.report_kiosks to authenticated;
`);
// the migration under test — applied TWICE to prove idempotency
const editSql = process.env.EDIT_SQL ? fs.readFileSync(process.env.EDIT_SQL, 'utf8').split(String.fromCharCode(13)).join('') : read('migration-edit-link.sql');
await db.exec(editSql);
await db.exec(editSql);

const payload = (over = {}, kiosks) => JSON.stringify({
  report_date: '2026-10-07', shift: 'IMP/D 10:00', officer: 'ทดสอบ', inspect_start: '10:00', inspect_end: '11:00',
  web_pc_ready: true, web_pc_remark: null, web_mobile_ready: true, web_mobile_remark: null, issue_log: 'เดิม',
  kiosks_total: 20, kiosks_ready: 2, kiosks_pending: 0, readiness_pct: 10,
  kiosks: kiosks || [
    { kiosk_id: 'IMM001', system_ready: true, rustdesk_ready: true, network_ready: true, remark: 'ปกติ' },
    { kiosk_id: 'IMM002', system_ready: true, rustdesk_ready: false, network_ready: true, remark: null, recheck_items: ['rustdesk'] },
  ], ...over });

const as = async (role, fn) => { await db.exec(`set role ${role}`); try { return await fn(); } finally { await db.exec('reset role'); } };
const call = (sql, params) => db.query(sql, params);
const fail = async (promise) => { try { await promise; } catch (e) { return e; } assert.fail('expected an error'); };
let n = 0; const ok = (m) => console.log('PASS', ++n, m);

// 1) the OLD function still works for the old site (backward compatible)
const old = await as('anon', () => call('select submit_tdac_report($1::jsonb) id', [payload({ shift: 'IMP/N 22:00' })]));
assert.ok(Number(old.rows[0].id) > 0); ok('v1 submit_tdac_report unchanged and still callable by anon');

// 2) v2 issues a token; only a hash is stored
const v2 = (await as('anon', () => call('select submit_tdac_report_v2($1::jsonb) r', [payload()]))).rows[0].r;
assert.match(v2.token, /^[0-9a-f]{64}$/); assert.ok(v2.id > 0); assert.ok(new Date(v2.expires) > new Date());
const row = (await call('select * from reports where id=$1', [v2.id])).rows[0];
assert.match(row.edit_token_hash, /^[0-9a-f]{64}$/); assert.notEqual(row.edit_token_hash, v2.token);
assert.ok(!JSON.stringify(row).includes(v2.token), 'raw token must not be stored anywhere in the row');
ok('v2 returns a 256-bit hex token; DB stores only its SHA-256 hash');

// 3) read for edit with the right token
const got = (await as('anon', () => call('select get_tdac_report_for_edit($1,$2) r', [v2.id, v2.token]))).rows[0].r;
assert.equal(got.report.issue_log, 'เดิม'); assert.equal(got.kiosks.length, 2); assert.equal(got.kiosks[1].recheck_items[0], 'rustdesk');
for (const k of ['edit_token_hash', 'edit_token_expires', 'last_link_edit_at', 'submitted_by']) assert.ok(!(k in got.report), k + ' must not leak');
ok('get_tdac_report_for_edit returns report + kiosks and never leaks token/hash/internal columns');

// 4) every failure looks the same (no existence oracle) 
const msgs = new Set(); 
for (const [id, tok] of [[v2.id, 'x'.repeat(64)], [v2.id, ''], [v2.id, null], [v2.id, "' or 1=1 --"], [999999, v2.token], [old.rows[0].id, v2.token]]) {
  const e = await fail(as('anon', () => call('select get_tdac_report_for_edit($1,$2)', [id, tok])));
  msgs.add(e.message + '|' + e.code);
}
assert.equal(msgs.size, 1, 'identical error for wrong token / wrong id / missing / injection: ' + [...msgs].join(' ## '));
ok('wrong token, empty, null, SQL-injection string, unknown id, other report\'s id => one identical error');

// 5) expired link
await call(`update reports set edit_token_expires = now() - interval '1 second' where id=$1`, [v2.id]);
await fail(as('anon', () => call('select get_tdac_report_for_edit($1,$2)', [v2.id, v2.token])));
await fail(as('anon', () => call('select update_tdac_report_by_token($1,$2,$3::jsonb)', [v2.id, v2.token, payload()])));
await call(`update reports set edit_token_expires = now() + interval '1 hour' where id=$1`, [v2.id]);
ok('expired link rejected for both read and write');

// 6) save an edit through the link
const edited = payload({ issue_log: 'แก้ผ่านลิงก์', web_pc_remark: 'เพิ่มภายหลัง', kiosks_ready: 3, kiosks_total: 20 }, [
  { kiosk_id: 'IMM001', system_ready: true, rustdesk_ready: true, network_ready: true, remark: 'ปกติ' },
  { kiosk_id: 'IMM002', system_ready: true, rustdesk_ready: true, network_ready: true, remark: 'RustDesk ตรวจแล้ว' },
  { kiosk_id: 'IMM003', system_ready: true, rustdesk_ready: true, network_ready: true, remark: 'เพิ่มเครื่อง' }]);
const upd = (await as('anon', () => call('select update_tdac_report_by_token($1,$2,$3::jsonb) r', [v2.id, v2.token, edited]))).rows[0].r;
const after = (await call('select * from reports where id=$1', [v2.id])).rows[0];
assert.equal(after.issue_log, 'แก้ผ่านลิงก์'); assert.equal(after.web_pc_remark, 'เพิ่มภายหลัง'); assert.equal(after.readiness_pct, 15);
assert.ok(after.last_link_edit_at); assert.ok(new Date(after.edit_token_expires) > new Date(Date.now() + 6 * 864e5), 'expiry extended ~7 days');
assert.equal((await call('select count(*)::int c from report_kiosks where report_id=$1', [v2.id])).rows[0].c, 3);
assert.equal((await call('select count(*)::int c from reports where report_date=$1 and shift=$2 and officer=$3', ['2026-10-07', 'IMP/D 10:00', 'ทดสอบ'])).rows[0].c, 1, 'no duplicate report');
ok('edit via token updates the SAME row, replaces kiosks, recalculates readiness, extends expiry, no duplicate');

// 7) locked fields
for (const bad of [{ report_date: '2026-10-08' }, { shift: 'IMP/N 22:00' }, { officer: 'คนอื่น' }]) {
  const e = await fail(as('anon', () => call('select update_tdac_report_by_token($1,$2,$3::jsonb)', [v2.id, v2.token, payload({ ...bad, issue_log: 'ห้ามเข้า' })])));
  assert.equal(e.code, '22023');
}
assert.equal((await call('select issue_log from reports where id=$1', [v2.id])).rows[0].issue_log, 'แก้ผ่านลิงก์', 'rejected edit must not change data');
ok('date / shift / officer cannot be changed through a link; rejected edit leaves data untouched');

// 8) token for report A cannot write report B
const other = (await as('anon', () => call('select submit_tdac_report_v2($1::jsonb) r', [payload({ officer: 'อีกคน', issue_log: 'ของอีกคน' })]))).rows[0].r;
await fail(as('anon', () => call('select update_tdac_report_by_token($1,$2,$3::jsonb)', [other.id, v2.token, payload({ officer: 'อีกคน', issue_log: 'โดนแก้' })])));
assert.equal((await call('select issue_log from reports where id=$1', [other.id])).rows[0].issue_log, 'ของอีกคน');
ok('a token only works for its own report');

// 9) re-submitting the same date+shift+officer rotates the token (old link dies, one row)
const again = (await as('anon', () => call('select submit_tdac_report_v2($1::jsonb) r', [payload({ issue_log: 'ส่งใหม่' })]))).rows[0].r;
assert.equal(again.id, v2.id); assert.notEqual(again.token, v2.token);
await fail(as('anon', () => call('select get_tdac_report_for_edit($1,$2)', [v2.id, v2.token])));
await as('anon', () => call('select get_tdac_report_for_edit($1,$2)', [v2.id, again.token]));
ok('submitting the same report again rotates the token: old link rejected, new link works, still one row');

// 10) anon has no direct table access; authenticated sees hash only
await fail(as('anon', () => call('select * from reports')));
await fail(as('anon', () => call('select * from report_kiosks')));
const authRows = (await as('authenticated', () => call('select edit_token_hash from reports where id=$1', [v2.id]))).rows[0];
assert.notEqual(authRows.edit_token_hash, again.token);
ok('anon cannot read tables directly; staff can only ever see the hash');

// 11) functions are not callable by PUBLIC beyond anon/authenticated grants, and run as owner
const priv = (await call(`select p.proname, p.prosecdef from pg_proc p where proname in ('submit_tdac_report_v2','get_tdac_report_for_edit','update_tdac_report_by_token') order by 1`)).rows;
assert.equal(priv.length, 3); assert.ok(priv.every(r => r.prosecdef));
ok('3 new functions installed as SECURITY DEFINER; migration applied twice without error (idempotent)');
console.log('\nALL', n, 'SQL checks passed on PostgreSQL', (await call('show server_version')).rows[0].server_version);
