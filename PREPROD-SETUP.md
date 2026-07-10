# PREPROD-SETUP — ขั้นตอนเปิดใช้ระบบ Preproduction

โฟลเดอร์นี้คือสำเนา **Preproduction** ของ OSO-TDAC Operational Report — โครงสร้างเหมือน production ทุกอย่าง ต่างกันเฉพาะ:

| จุดที่ต่าง | ค่าใน preprod |
|---|---|
| `config.js` | ชี้ Supabase project **preprod** (ตอนนี้เป็น placeholder — ต้องวางค่าก่อนใช้) |
| `deploy-functions.ps1` | `$ProjectRef` เป็น placeholder + มีด่านกันรันโดยยังไม่แก้ค่า |
| `schema.sql` | อีเมล admin ท้ายไฟล์เป็น placeholder |
| `.github/workflows/monthly-report.yml` | **ปิด cron** เหลือเฉพาะกดรันเอง และไม่มี fallback URL ไป production |
| `index.html` | มีแถบเตือน ⚠️ PREPRODUCTION ด้านบนสุด (ห้ามลบใน repo นี้) |

> ⚠️ คู่มือเดิม (`USER-MANAGEMENT.md`, `SEND-EMAIL.md`, `AUTO-REPORT.md`) ยังมีตัวอย่างคำสั่งที่ใส่ project ref ของ **production** (`lmoqbnztmwjwzowqeorz`) — เวลาทำตามใน preprod ให้แทนด้วย ref ของ preprod เสมอ

---

## Checklist เปิดใช้ (ทำครั้งเดียว ~20 นาที)

### 1) สร้าง Supabase project (preprod)
1. https://supabase.com/dashboard → **New project** → ชื่อ `oso-tdac-preprod` → region **Southeast Asia (Singapore)** (เดียวกับ production)
2. จด **Project URL**, **anon key**, **project ref** (ตัวอักษรหน้า `.supabase.co`)

### 2) รัน schema
1. เปิด **SQL Editor** → วาง `schema.sql` ทั้งไฟล์
2. แก้บรรทัดท้าย `CHANGE_ME_PREPROD_ADMIN@example.com` → อีเมล admin ทดสอบ → **Run**
3. **Authentication → Users** → สร้างบัญชีอีเมลเดียวกัน → รัน SQL บรรทัดท้ายซ้ำอีกครั้ง → login ออก-เข้า 1 ครั้ง

### 3) ใส่ค่าใน `config.js`
แทน `PASTE_PREPROD_PROJECT_REF` และ `PASTE_PREPROD_ANON_KEY` ด้วยค่าจากข้อ 1
**ห้าม copy ค่าจากโฟลเดอร์ `Github` (production) มาวาง**

### 4) Deploy Edge Functions
1. แก้ `deploy-functions.ps1` บรรทัด `$ProjectRef = "PASTE_PREPROD_PROJECT_REF"` → ref ของ preprod
2. รัน: `powershell -ExecutionPolicy Bypass -File .\deploy-functions.ps1`
3. ตั้ง secrets (แนะนำแยกจาก production — โควตา Brevo ฟรี ~300 ฉบับ/วัน แชร์กันทั้ง account):
   ```
   npx supabase secrets set BREVO_API_KEY="..." SENDER_EMAIL="..." SENDER_NAME="OSO-TDAC (PREPROD)" ADMIN_EMAILS="..." APP_URL="https://<user>.github.io/<repo-preprod>/" --project-ref <PREPROD_REF>
   ```
   > `APP_URL` สำคัญ: ถ้าไม่ตั้ง อีเมลจาก preprod จะมีลิงก์ชี้ไปหน้า production

### 5) สร้าง GitHub repo + Pages
1. https://github.com/new → ชื่อ `OSO-TDAC-Preprod` (แนะนำชื่อที่เดายาก เพราะ Pages เป็น public)
2. ในโฟลเดอร์นี้:
   ```
   git remote add origin https://github.com/<user>/OSO-TDAC-Preprod.git
   git push -u origin main
   ```
3. **Settings → Pages** → Deploy from branch `main` / root

### 6) (ทางเลือก) เปิดทดสอบส่งรายงานรายเดือน
- ตั้ง repo **Variables**: `APP_URL` = URL หน้า Pages ของ preprod
- ตั้ง repo **Secrets**: `REPORT_BOT_EMAIL`, `REPORT_BOT_PASSWORD` (บัญชีบอทใน preprod), `REPORT_RECIPIENTS` = **กล่องทดสอบเท่านั้น**
- ทดสอบด้วยปุ่ม **Run workflow** (cron ปิดถาวรใน repo นี้)

---

## กติกาการใช้ preprod

- **ทดสอบที่นี่ก่อนเสมอ**: แก้โค้ด/schema → commit ที่ preprod → รัน SQL ที่ project preprod → ทดสอบผ่าน → ค่อยยกไป production (copy ไฟล์ไปโฟลเดอร์ `Github` + รัน SQL ที่ project จริง)
- **อย่ากรอกข้อมูลจริง** ใน preprod (หน้าเว็บมีแถบเตือนอยู่แล้ว)
- Free tier จะ **pause project หลังไม่ใช้งาน ~7 วัน** — เข้า dashboard กด Restore ได้ ข้อมูลไม่หาย
- ไฟล์ที่ **ห้าม sync ไป production**: `config.js`, `deploy-functions.ps1` (ค่า ref), `monthly-report.yml` (cron ปิด), แถบ `preprodBanner` ใน `index.html`, และไฟล์นี้
