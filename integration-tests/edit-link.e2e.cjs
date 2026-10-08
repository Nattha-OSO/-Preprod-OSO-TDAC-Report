const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const URL_ = process.argv[2] || 'file:///D:/Ai%20Tools/Claude/OSO%20TDAC%20Report/Github-Preprod/index.html';
const TOKEN = 'ab'.repeat(32), NEWTOKEN = 'cd'.repeat(32);
let n = 0; const ok = m => console.log('PASS', ++n, m);

const reportRow = (extra = {}) => ({
  report: { id: 7, report_date: '2026-10-07', shift: 'IMP/D 10:00', officer: 'ทดสอบ ผู้ตรวจ', inspect_start: '10:00', inspect_end: '11:20',
    web_pc_ready: true, web_pc_remark: null, web_mobile_ready: true, web_mobile_remark: null, issue_log: 'ปัญหาเดิมในฐานข้อมูล',
    issue_photos: [], web_pc_photos: [], web_mobile_photos: [], ...extra },
  kiosks: Array.from({ length: 20 }, (_, i) => ({ kiosk_id: 'IMM' + String(i + 1).padStart(3, '0'), system_ready: true, rustdesk_ready: i !== 4, network_ready: true,
    occupied: false, recheck_at: null, recheck_items: [],
    remark: (i < 6 ? 'มีเจ้าหน้าที่ ตม. ประจำจุด' : i < 10 ? 'ไม่มีเจ้าหน้าที่ ตม. ประจำจุด' : i < 16 ? 'มีเจ้าหน้าที่ ตม. ประจำจุด' : 'ไม่มีเจ้าหน้าที่ ตม. ประจำจุด') + (i === 4 ? '\nRustDesk remote ไม่ได้' : ''),
    remark_photos: [] })),
  expires: new Date(Date.now() + 6 * 864e5).toISOString() });

async function newPage(browser, handlers) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await ctx.newPage();
  const log = { rpc: [], fn: [], writes: [] };
  await page.route('**/*supabase.co/**', async route => {
    const req = route.request(), url = req.url(), method = req.method();
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/rest/v1/officers')) return json(200, [{ name: 'ทดสอบ ผู้ตรวจ', email: 'officer@example.com' }, { name: 'อีกคน', email: 'b@example.com' }]);
    const rpc = /\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(url);
    if (rpc) { const body = req.postDataJSON(); log.rpc.push({ name: rpc[1], body }); return handlers.rpc(rpc[1], body, json); }
    const fn = /\/functions\/v1\/([a-z-]+)/.exec(url);
    if (fn) { log.fn.push({ name: fn[1], body: req.postDataJSON() }); return json(200, { ok: true }); }
    if (method !== 'GET') { log.writes.push(method + ' ' + url); return route.abort(); }
    return json(200, []);
  });
  page.on('dialog', d => d.accept());
  return { page, ctx, log };
}

async function fillAndSubmit(page) {
  await page.selectOption('#pubShift', { index: 1 });
  if (!(await page.locator('#pubOfficer').isDisabled())) await page.selectOption('#pubOfficer', { index: 1 });
  for (let z = 0; z < 4; z++) { const b = page.locator(`.btn-imm[data-zone="${z}"]`); if ((await b.getAttribute('data-state')) === '') await b.click(); }
  await page.check('#pubWebPc').catch(() => {}); await page.check('#pubWebMobile').catch(() => {});
  await page.click('#pubSubmit'); await page.waitForTimeout(1800);
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });

  // ===== A) New report: v2 RPC => token => link in email + shown on thank-you page =====
  {
    const { page, log } = await newPage(browser, { rpc: (name, body, json) => name === 'submit_tdac_report_v2' ? json(200, { id: 7, token: NEWTOKEN, expires: new Date(Date.now() + 7 * 864e5).toISOString() }) : json(404, {}) });
    await page.goto(URL_ + '?x=' + Date.now(), { waitUntil: 'networkidle' }); await page.waitForSelector('#pubKioskBody .krow');
    await fillAndSubmit(page);
    const call = log.rpc.find(r => r.name === 'submit_tdac_report_v2'); assert.ok(call, 'new report uses submit_tdac_report_v2');
    assert.ok(!log.rpc.some(r => r.name === 'submit_tdac_report'), 'old RPC not called when v2 works');
    const mail = log.fn.find(f => f.name === 'send-public-report'); assert.ok(mail, 'email sent');
    assert.ok(mail.body.message.includes('#edit=7.' + NEWTOKEN), 'email body carries the edit link');
    assert.ok(mail.body.message.includes('ห้ามส่งต่อ'), 'email warns not to share');
    assert.ok(!mail.body.subject.includes(NEWTOKEN) && !mail.body.filename.includes(NEWTOKEN), 'token only in the body');
    assert.ok(await page.locator('#pubEditLinkBox').isVisible(), 'link box shown on thank-you page');
    assert.ok((await page.inputValue('#pubEditLinkInput')).endsWith('#edit=7.' + NEWTOKEN));
    ok('A) new report -> v2 RPC, email contains edit link + warning, thank-you page shows copyable link');
    // token must not be persisted in the browser
    const stored = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    assert.ok(!stored.includes(NEWTOKEN), 'token never written to local/session storage'); ok('A2) token is not stored in localStorage/sessionStorage');
    await page.close();
  }

  // ===== B) Open link on a "different device" (empty storage): form loads server data, fields locked =====
  {
    const sentinel = JSON.stringify({ v: 'x', date: '2000-01-01', shift: 'OLD', officer: 'ร่างคนอื่น', kiosks: [] });
    const { page, log } = await newPage(browser, { rpc: (name, body, json) => {
      if (name === 'get_tdac_report_for_edit') return json(200, reportRow());
      if (name === 'update_tdac_report_by_token') return json(200, { id: 7, expires: new Date(Date.now() + 7 * 864e5).toISOString() });
      return json(404, {}); } });
    await page.addInitScript(s => { if (!localStorage.getItem('tdac_draft_v1')) localStorage.setItem('tdac_draft_v1', s); }, sentinel);
    await page.goto(URL_ + '?x=' + Date.now() + '#edit=7.' + TOKEN, { waitUntil: 'networkidle' });
    await page.waitForSelector('#pubEditBar', { state: 'visible', timeout: 15000 });
    const get = log.rpc.find(r => r.name === 'get_tdac_report_for_edit'); assert.deepEqual(get.body, { p_id: 7, p_token: TOKEN });
    assert.equal(await page.inputValue('#pubOfficer'), 'ทดสอบ ผู้ตรวจ'); assert.equal(await page.inputValue('#pubShift'), 'IMP/D 10:00'); assert.equal(await page.inputValue('#pubDate'), '2026-10-07');
    assert.ok(await page.locator('#pubOfficer').isDisabled() && await page.locator('#pubShift').isDisabled() && await page.locator('#pubDateBtn').isDisabled(), 'date/shift/officer locked');
    assert.equal(await page.inputValue('#pubIssue'), 'ปัญหาเดิมในฐานข้อมูล'); assert.equal(await page.inputValue('#pubStart'), '10:00'); assert.equal(await page.inputValue('#pubEnd'), '11:20', 'saved end time is loaded back (not blanked like a local draft)');
    assert.equal(await page.inputValue('#pubEmail'), 'officer@example.com', 'new DOCX goes to the registered email of the report officer');
    assert.equal(await page.locator('.subchk[data-state="ok"]').count(), 59, 'kiosk states loaded from DB (60 - 1 RustDesk x)');
    assert.equal(await page.locator('.subchk[data-state="no"]').count(), 1);
    assert.equal(await page.locator('.btn-imm[data-zone="0"]').getAttribute('data-state'), 'yes'); assert.equal(await page.locator('.btn-imm[data-zone="1"]').getAttribute('data-state'), 'no');
    assert.equal(await page.inputValue('textarea[data-kiosk="IMM005"][data-type="remark"]'), 'RustDesk remote ไม่ได้', 'remark text restored without the ตม. line');
    assert.ok((await page.locator('#pubSubmit').innerText()).includes('บันทึกการแก้ไข'), 'button relabelled');
    assert.ok(!(await page.locator('#pubClearBtn').isVisible()), 'clear-previous button hidden in edit mode');
    ok('B) edit link on a fresh device loads the saved report from the server; date/shift/officer locked; states, remarks, ตม. restored');

    // edit something and save
    await page.fill('#pubIssue', 'เติมภายหลังจากเครื่องอื่น'); await page.click('#pubEndNow');
    await page.click('#pubSubmit'); await page.waitForTimeout(1800);
    const up = log.rpc.find(r => r.name === 'update_tdac_report_by_token'); assert.ok(up, 'save uses update_tdac_report_by_token');
    assert.equal(up.body.p_id, 7); assert.equal(up.body.p_token, TOKEN);
    assert.equal(up.body.payload.report_date, '2026-10-07'); assert.equal(up.body.payload.shift, 'IMP/D 10:00'); assert.equal(up.body.payload.officer, 'ทดสอบ ผู้ตรวจ');
    assert.equal(up.body.payload.issue_log, 'เติมภายหลังจากเครื่องอื่น'); assert.equal(up.body.payload.kiosks.length, 20);
    assert.ok(!log.rpc.some(r => r.name.startsWith('submit_tdac_report')), 'never creates a new report while editing');
    const mail = log.fn.find(f => f.name === 'send-public-report'); assert.ok(mail && mail.body.message.includes('#edit=7.' + TOKEN), 'new DOCX email keeps the SAME link');
    assert.equal(mail.body.to, 'officer@example.com');
    ok('B2) saving edits calls update RPC with same id/token + unchanged key fields, never creates a new report, re-emails DOCX with same link');
    const draftAfter = await page.evaluate(() => localStorage.getItem('tdac_draft_v1'));
    assert.equal(draftAfter, sentinel, 'the unrelated local draft is untouched'); ok('B3) editing a server report did not read/overwrite the device\'s local draft');

    // back on the thank-you page "edit again" keeps edit mode; "next round" leaves it cleanly
    await page.click('text=แก้/ตรวจเพิ่มรอบนี้'); assert.ok(await page.locator('#pubForm').isVisible()); assert.ok(await page.locator('#pubOfficer').isDisabled());
    await page.click('#pubSubmit'); await page.waitForTimeout(1500);
    await page.click('text=ทำรายงานรอบถัดไป');
    assert.ok(!(await page.locator('#pubOfficer').isDisabled()), 'unlocked after leaving edit mode'); assert.ok(!(await page.evaluate(() => location.hash)), 'hash cleared');
    assert.equal(await page.inputValue('#pubIssue'), ''); assert.equal(await page.evaluate(() => localStorage.getItem('tdac_draft_v1')), sentinel, 'leaving edit mode still keeps the unrelated draft');
    assert.ok((await page.locator('#pubSubmit').innerText()).includes('ส่งรายงานการตรวจสอบ'));
    ok('B4) "edit again" stays in edit mode; "next round" exits edit mode, clears hash, unlocks fields, keeps unrelated draft');
    assert.equal(log.writes.length, 0, 'no stray writes'); await page.close();
  }

  // ===== C) Invalid / expired link =====
  {
    const { page, log } = await newPage(browser, { rpc: (name, body, json) => json(403, { code: '28000', message: 'ลิงก์แก้ไขไม่ถูกต้องหรือหมดอายุ' }) });
    await page.goto(URL_ + '?x=' + Date.now() + '#edit=7.' + TOKEN, { waitUntil: 'networkidle' });
    await page.waitForSelector('#pubEditInvalid', { state: 'visible', timeout: 15000 });
    assert.ok(!(await page.locator('#pubForm').isVisible()), 'form hidden so nothing can be submitted');
    assert.ok((await page.locator('#pubEditInvalid').innerText()).includes('ลิงก์แก้ไขใช้ไม่ได้'));
    await page.click('text=ไปหน้าส่งรายงานใหม่'); assert.ok(await page.locator('#pubForm').isVisible()); assert.ok(!(await page.locator('#pubOfficer').isDisabled()));
    assert.equal(log.rpc.filter(r => r.name !== 'get_tdac_report_for_edit').length, 0);
    ok('C) invalid/expired link shows an error page (no form), and "new report" works afterwards'); await page.close();
  }

  // ===== D) Malformed hash is ignored (normal form) =====
  {
    const { page, log } = await newPage(browser, { rpc: (n, b, json) => json(404, {}) });
    await page.goto(URL_ + '?x=' + Date.now() + '#edit=7.nothex', { waitUntil: 'networkidle' }); await page.waitForSelector('#pubKioskBody .krow');
    assert.equal(log.rpc.length, 0, 'no RPC for a malformed link'); assert.ok(!(await page.locator('#pubEditBar').isVisible()));
    ok('D) malformed link is ignored: normal blank form, no server call'); await page.close();
  }

  // ===== E) DB not migrated yet: falls back to old RPC, no link, still saves =====
  {
    const { page, log } = await newPage(browser, { rpc: (name, body, json) => name === 'submit_tdac_report_v2'
      ? json(404, { code: 'PGRST202', message: 'Could not find the function public.submit_tdac_report_v2(payload) in the schema cache' })
      : name === 'submit_tdac_report' ? json(200, 9) : json(404, {}) });
    await page.goto(URL_ + '?x=' + Date.now(), { waitUntil: 'networkidle' }); await page.waitForSelector('#pubKioskBody .krow');
    await fillAndSubmit(page);
    assert.deepEqual(log.rpc.map(r => r.name), ['submit_tdac_report_v2', 'submit_tdac_report']);
    const mail = log.fn.find(f => f.name === 'send-public-report'); assert.ok(mail && !mail.body.message.includes('#edit='), 'no link in email when feature unavailable');
    assert.ok(!(await page.locator('#pubEditLinkBox').isVisible()), 'no link box'); assert.ok(await page.locator('#pubThanks').isVisible(), 'report still saved + thank-you shown');
    ok('E) DB without the migration: falls back to the old RPC, report still saves, email has no link'); await page.close();
  }

  // ===== F) A real failure (not "missing function") must NOT silently fall back =====
  {
    const { page, log } = await newPage(browser, { rpc: (name, body, json) => json(400, { code: '23514', message: 'boom' }) });
    await page.goto(URL_ + '?x=' + Date.now(), { waitUntil: 'networkidle' }); await page.waitForSelector('#pubKioskBody .krow');
    await fillAndSubmit(page);
    assert.deepEqual(log.rpc.map(r => r.name), ['submit_tdac_report_v2'], 'no duplicate submit via the old RPC');
    assert.ok(!(await page.locator('#pubThanks').isVisible()), 'stays on the form with an error'); assert.equal(log.fn.length, 0, 'no email when saving failed');
    ok('F) genuine server error: no silent fallback, no duplicate save, no email, user stays on the form'); await page.close();
  }

  console.log('\nALL', n, 'browser checks passed'); await browser.close();
})().catch(e => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
