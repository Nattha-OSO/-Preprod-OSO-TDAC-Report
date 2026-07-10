# OSO-TDAC Operational Report — ⚠️ PREPRODUCTION

> **นี่คือระบบทดสอบ (preprod)** — ไม่ใช่ระบบจริง ห้ามกรอกรายงานจริง · ขั้นตอนเปิดใช้และกติกา ดู [PREPROD-SETUP.md](PREPROD-SETUP.md)

ระบบรายงานการตรวจสอบระบบ **TDAC** (Thailand Digital Arrival Card) — ทั้ง **Website (PC + Mobile)** และ **Kiosk (IMM001–IMM020)** ณ ท่าอากาศยานสุวรรณภูมิ (BKK) สำหรับเจ้าหน้าที่ **Onsite Support Officer (OSO)**

เว็บแอปแบบ static (GitHub Pages) + Supabase (Postgres + RLS + Auth + Realtime + Edge Functions) — สถาปัตยกรรมหลังบ้านเดียวกับระบบ **OSO Evaluation by IMM** (auth/RBAC/audit/รายงาน DOCX/ส่งอีเมลอัตโนมัติ)

---

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | UI ทั้งหมด — ฟอร์มรายงานสาธารณะ (TDAC) + หลังบ้าน (login/register/dashboard/modal) |
| `app.js` | ตรรกะทั้งหมด — auth, RBAC, แดชบอร์ด, รายงาน DOCX/HTML, ส่งอีเมล, ส่งอัตโนมัติ |
| `config.js` | ค่า `SUPABASE_URL` + `SUPABASE_ANON_KEY` (**ต้องแก้ก่อนใช้**) |
| `schema.sql` | สร้างตาราง + RLS + Realtime ทั้งหมด (รันใน Supabase SQL Editor) |
| `assets/` | โลโก้ สตม. + SO SKY |
| `supabase/functions/` | Edge Functions: `register`, `admin-users`, `send-report` |
| `.github/` | GitHub Actions ส่งรายงานรายเดือนอัตโนมัติ (Playwright) |
| `deploy-functions.ps1` | สคริปต์ deploy Edge Functions ทั้ง 3 ตัว |
| `USER-MANAGEMENT.md` · `SEND-EMAIL.md` · `AUTO-REPORT.md` | คู่มือผู้ดูแลระบบ |

---

## โครงสร้างฐานข้อมูล (Data model)

- **`reports`** — 1 แถว = 1 การตรวจสอบ 1 รอบ: `report_date, shift, officer, web_pc_ready/remark, web_mobile_ready/remark, issue_log` + สรุป `kiosks_ready / kiosks_total / readiness_pct`
- **`report_kiosks`** — 20 แถวต่อรายงาน: `kiosk_id (IMM001–020), system_ready, rustdesk_ready, network_ready, remark` (FK → reports, `on delete cascade`)
- **`officers`** — ทะเบียนชื่อเจ้าหน้าที่ OSO ผู้ตรวจสอบ (เติม dropdown ในฟอร์ม)
- **reuse:** `audit_log`, `app_settings`, `profiles`, `access_requests`, `auth.users` (role ใน `app_metadata`)

**RLS:** ฟอร์มสาธารณะ (anon) `insert` ได้เฉพาะ `reports` + `report_kiosks` (อ่านไม่ได้) · หลังบ้านต้อง login + role ∈ {admin, senior, manager}

---

## ติดตั้ง (Setup)

1. **สร้าง Supabase project ใหม่** → คัดลอก Project URL + anon key มาวางใน `config.js`
2. เปิด **SQL Editor** → วาง `schema.sql` ทั้งหมด → **Run**
   - แก้บรรทัดท้าย `where email = 'CHANGE_ME@example.com'` ให้เป็นอีเมล admin ของคุณ
3. สร้างบัญชี admin ใน **Authentication → Users** (อีเมลเดียวกับข้อ 2) แล้ว **ออก-เข้าระบบ 1 ครั้ง** ให้ JWT มี role
4. Deploy Edge Functions: `./deploy-functions.ps1` (ต้องมี `SUPABASE_ACCESS_TOKEN`) — ดู `USER-MANAGEMENT.md`
5. ตั้งค่า **Brevo** สำหรับส่งอีเมล — ดู `SEND-EMAIL.md`
6. (ทางเลือก) ตั้งค่าส่งรายงานอัตโนมัติรายเดือน — ดู `AUTO-REPORT.md`
7. push ขึ้น GitHub แล้วเปิด **GitHub Pages** (branch `main`)

> **Cache-busting:** ทุกการแก้ไขให้เพิ่ม `APP_VERSION` ใน `app.js` และ `?v=NN` ใน `index.html` (`config.js?v=NN`, `app.js?v=NN`)

---

## ฟีเจอร์

- **ฟอร์มสาธารณะ** — เลือกวันที่/รอบ/ผู้ตรวจ · Kiosk Checklist 20 เครื่อง (System/RustDesk/Network + Remark + Check All) · Website PC/Mobile · บันทึกปัญหา · แถบสรุป Readiness แบบ real-time
- **แดชบอร์ด** — KPI (จำนวนรายงาน, Readiness เฉลี่ย, รอบล่าสุด), เครื่องที่ต้องติดตาม, จำนวนตามรอบ/ผู้ตรวจ
- **รายการรายงาน** — ดู/แก้ไข/ลบรายงานทั้งฉบับ (ตามสิทธิ์)
- **สรุปรายเครื่อง Kiosk** — สุขภาพรายเครื่อง (Not Ready / Readiness / ระบบที่ล้มบ่อย)
- **วิเคราะห์ภาพรวม** — Readiness รายเดือน, ระบบที่ล้มบ่อย, บันทึกปัญหา
- **Auth + RBAC** — ลงทะเบียน + อนุมัติโดย admin, สิทธิ์ปรับได้ (มีผลทันทีผ่าน Realtime)
- **รายงาน** — DOCX (มีกราฟ Not Ready รายเครื่อง) + HTML preview + ส่งอีเมล (Brevo) + ส่งอัตโนมัติรายเดือน
- **Audit Log** + **จัดการผู้ใช้** (admin)
