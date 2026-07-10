// ส่งรายงานรายเดือนอัตโนมัติ ผ่าน Chromium headless (Playwright)
//  เปิดเว็บแอป -> ล็อกอินบัญชีบอท -> เรียก window.sendAutoMonthly(recipients)
//  ใช้โค้ดสร้างรายงานเดิมของเว็บ จึงได้ DOCX พร้อมกราฟเหมือนกดเอง
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL;
const email = process.env.BOT_EMAIL;
const password = process.env.BOT_PASSWORD;
const recipients = process.env.REPORT_RECIPIENTS || '';   // ไม่บังคับ — ปกติตั้งผู้รับในเมนูเว็บ

function fail(msg) { console.error('❌ ' + msg); process.exit(1); }
if (!APP_URL) fail('ไม่ได้ตั้ง APP_URL');
if (!email || !password) fail('ไม่ได้ตั้ง REPORT_BOT_EMAIL / REPORT_BOT_PASSWORD (GitHub Secrets)');

const url = APP_URL + (APP_URL.includes('?') ? '&' : '?') + 'v=auto' + Date.now();
console.log('เปิด', url);

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60000);
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));

try {
  await page.goto(url, { waitUntil: 'networkidle' });

  // ไปหน้าล็อกอิน
  await page.waitForFunction(() => typeof window.showLogin === 'function');
  await page.evaluate(() => window.showLogin());
  await page.fill('#loginUser', email);
  await page.fill('#loginPass', password);
  await page.click('#loginBtn');

  // รอเข้าระบบสำเร็จ (แอปพร้อมใช้งาน)
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  console.log('✓ ล็อกอินบัญชีบอทสำเร็จ');

  // เรียกสร้าง + ส่งรายงานรายเดือน (เดือนก่อนหน้า) — กดรันเอง (FORCE) จะส่งแม้สวิตช์ยังปิด
  const force = process.env.FORCE === 'true';
  const result = await page.evaluate(async ({ r, f }) => await window.sendAutoMonthly(r, f), { r: recipients, f: force });
  console.log('ผลลัพธ์:', JSON.stringify(result));

  if (!result || !result.ok) fail('ส่งรายงานไม่สำเร็จ: ' + (result && result.error || 'unknown'));
  if (result.skipped) console.log('⏭️ ข้ามการส่ง: ' + (result.message || 'ปิดอยู่'));
  else console.log('✅ ส่งรายงาน ' + (result.period || '') + ' ไปยัง: ' + (result.recipients || []).join(', '));
} catch (e) {
  fail(String(e && e.message || e));
} finally {
  await browser.close();
}
