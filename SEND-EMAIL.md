# ส่งรายงานทางอีเมล (PDF) — ใช้ Brevo

ในหน้าต่าง "รายงาน DOCX":
- **👁 ดูตัวอย่าง PDF** — เปิดหน้าตัวอย่าง (Ctrl+P บันทึก PDF ได้) — **ใช้ได้ทันที ไม่ต้องตั้งค่า**
- **✉ ส่งอีเมล (PDF)** — ส่ง PDF ไปอีเมลที่ระบุ — **ต้องตั้งค่า Brevo + deploy ฟังก์ชันก่อน**

> เปลี่ยนจาก SMTP มาใช้ **Brevo (HTTP API)** เพราะสร้างอีเมลถูกต้อง (ภาษาไทย + ไฟล์แนบ) เสถียรกว่า

---

## ตั้งค่าส่งอีเมล (ครั้งเดียว ~10 นาที)

### 1) สมัคร Brevo + verify ผู้ส่ง
1. สมัครฟรีที่ **https://www.brevo.com** (ฟรี 300 อีเมล/วัน)
2. เมนู **Senders, Domains & Dedicated IPs → Senders → Add a sender**
   - ใส่ชื่อ + อีเมลผู้ส่ง (เช่น `nattha.b@somapait.com` หรือ `oso.somapait@gmail.com`)
   - Brevo ส่งลิงก์ยืนยันไปอีเมลนั้น → เปิดอีเมลกด **ยืนยัน** (verify)
3. เมนู **SMTP & API → API Keys → Generate a new API key** → คัดลอก (ขึ้นต้น `xkeysib-...`)

### 2) ตั้งความลับ + deploy (PowerShell ที่โฟลเดอร์ Github)
```powershell
cd "D:\Ai Tools\Claude\OSO-TDAC Operational Report\Github"
$env:SUPABASE_ACCESS_TOKEN="<โทเค็นจริง sbp_... จาก https://supabase.com/dashboard/account/tokens>"

npx supabase secrets set BREVO_API_KEY="xkeysib-คีย์จริง" SENDER_EMAIL="nattha.b@somapait.com" SENDER_NAME="OSO-TDAC Operational Report" --project-ref lmoqbnztmwjwzowqeorz

npx supabase functions deploy send-report --project-ref lmoqbnztmwjwzowqeorz --use-api
```
> ⚠️ `SENDER_EMAIL` ต้องเป็นอีเมลที่ **verify ใน Brevo แล้ว** เท่านั้น

### 3) ใช้งาน
หน้ารายงาน → เลือกช่วง → กรอกอีเมลผู้รับ (หลายคนคั่นด้วย ,) → **ดูตัวอย่าง** → **ส่งอีเมล** → ผู้รับได้อีเมลภาษาไทย + ไฟล์ PDF แนบ

---

## หมายเหตุ
- ลบความลับ SMTP เก่าได้ (ไม่ใช้แล้ว): `npx supabase secrets unset SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM --project-ref lmoqbnztmwjwzowqeorz`
- ถ้ายังไม่ตั้งค่า/ยังไม่ deploy: ปุ่มส่งอีเมลจะขึ้นข้อความว่ายังไม่ได้ตั้งค่า — แต่ **ดูตัวอย่าง + บันทึก PDF เองได้ปกติ**
- การส่งอีเมลถูกบันทึกใน Audit Log (admin ดูได้)
