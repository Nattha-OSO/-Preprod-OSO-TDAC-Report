# การจัดการผู้ใช้ระบบ (Roles: admin / senior / manager)

ระบบสิทธิ์:
- **admin** — จัดการผู้ใช้ได้ (เพิ่ม/ลบบัญชีล็อกอิน + กำหนดสิทธิ์ + อนุมัติคำขอลงทะเบียน) เห็นเมนู "จัดการผู้ใช้ระบบ"
- **senior**, **manager** — ใช้งานทุกอย่างได้ **ยกเว้น** จัดการผู้ใช้ (ไม่เห็นเมนูนี้)
- **(ยังไม่อนุมัติ)** — ผู้ที่ลงทะเบียนแต่ admin ยังไม่กำหนดสิทธิ์ = ล็อกอินไม่ได้ (ขึ้นข้อความ "รออนุมัติ") และเข้าถึงข้อมูลผ่าน API ไม่ได้ (RLS บังคับต้องมี role)

การสร้าง/ลบบัญชีล็อกอินจริงต้องใช้ `service_role` จึงทำผ่าน **Supabase Edge Function**:
- `admin-users` — เพิ่ม/ลบ/เปลี่ยนสิทธิ์ (เฉพาะ admin) — `supabase/functions/admin-users/index.ts`
- `register` — รับคำขอลงทะเบียนจากหน้า public (ไม่ต้องล็อกอิน) สร้างบัญชี "รออนุมัติ" — `supabase/functions/register/index.ts`

---

## ระบบลงทะเบียน + อนุมัติ (ตั้งแต่เวอร์ชัน 38)

**ผู้ขอใช้งาน:** หน้าเข้าสู่ระบบ → ปุ่ม **"ลงทะเบียนขอใช้งานระบบ"** → กรอกชื่อ/อีเมล/รหัสผ่าน/เหตุผล → ส่งคำขอ
→ บัญชีถูกสร้างสถานะ **รออนุมัติ** (ยังเข้าระบบไม่ได้)

**Admin:** เมนู **จัดการผู้ใช้ระบบ** → แผง **"คำขอลงทะเบียน (รออนุมัติ)"** → เลือกสิทธิ์ → กด **อนุมัติ** (เปิดใช้งานทันที) หรือ **ปฏิเสธ** (ลบบัญชีคำขอ)

> ต้องรัน `schema.sql` ส่วน **access_requests + RLS** (idempotent รันซ้ำได้) และ deploy ฟังก์ชัน `register` (ดูด้านล่าง)

**แจ้งเตือนอีเมล (อัตโนมัติ):**
- มีคำขอใหม่ → ระบบส่งอีเมลแจ้ง **admin** (ใช้รายชื่อจาก secret `ADMIN_EMAILS`)
- admin กดอนุมัติ → ระบบส่งอีเมลแจ้ง **ผู้ใช้** ว่าเข้าใช้งานได้แล้ว
- ใช้ Brevo ชุดเดียวกับการส่งรายงาน (`BREVO_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME`) — ถ้ายังไม่ตั้งค่า การอนุมัติ/ลงทะเบียนยังทำงานได้ปกติ เพียงแต่ไม่มีอีเมลแจ้ง
- ตั้ง URL ระบบในอีเมลได้ด้วย secret `APP_URL` (ไม่ตั้งก็ใช้ค่าเริ่มต้น GitHub Pages)
- หลังแก้ฟังก์ชันนี้ ต้อง **deploy ใหม่ทั้ง `register` และ `admin-users`**

---

## ติดตั้ง Edge Function (ทำครั้งเดียว)

เปิด PowerShell ที่โฟลเดอร์ `Github` (มี Node อยู่แล้ว ใช้ `npx` ได้เลย):

```powershell
cd "D:\Ai Tools\Claude\OSO-TDAC Operational Report\Github"

# 1) ล็อกอิน Supabase CLI (เปิดเบราว์เซอร์ให้กดอนุญาต)
npx supabase login

# 2) เชื่อมกับโปรเจกต์ (project-ref = ส่วนหน้าของ URL)
npx supabase link --project-ref lmoqbnztmwjwzowqeorz

# 3) ตั้งอีเมล admin เริ่มต้น (bootstrap) — บัญชีนี้จะเป็น admin ทันที
npx supabase secrets set ADMIN_EMAILS="nattha.b@somapait.com"

# 4) deploy ฟังก์ชัน
npx supabase functions deploy admin-users

# 5) deploy ฟังก์ชันลงทะเบียน (ต้องใส่ --no-verify-jwt เพราะเป็นหน้า public ไม่ต้องล็อกอิน)
npx supabase functions deploy register --no-verify-jwt
```

> ถ้า login/link แบบ non-interactive ไม่ได้ ให้ใช้แทน:
> ```powershell
> $env:SUPABASE_ACCESS_TOKEN="<โทเค็นจริง sbp_... จาก https://supabase.com/dashboard/account/tokens>"
> npx supabase functions deploy admin-users --project-ref lmoqbnztmwjwzowqeorz --use-api
> npx supabase functions deploy register --project-ref lmoqbnztmwjwzowqeorz --use-api --no-verify-jwt
> ```

> ถ้าถาม project password ตอน link ให้ใส่รหัส database ที่ตั้งตอนสร้างโปรเจกต์

---

## ใช้งาน
1. ล็อกอินด้วยบัญชีที่อยู่ใน `ADMIN_EMAILS` → จะเห็นเมนู **"จัดการผู้ใช้ระบบ (admin)"** ที่แถบซ้าย
2. ในหน้านั้น:
   - **เพิ่มผู้ใช้**: กรอก email + รหัสผ่าน + เลือกสิทธิ์ (admin/senior/manager) → กดเพิ่ม (บัญชีถูกยืนยันอีเมลให้อัตโนมัติ)
   - **เปลี่ยนสิทธิ์**: เลือกจาก dropdown ในตาราง
   - **ลบ**: กดปุ่มลบ (ลบบัญชีตัวเองไม่ได้)
3. ผู้ใช้ที่ถูกตั้งเป็น senior/manager เมื่อล็อกอินจะ **ไม่เห็นเมนูจัดการผู้ใช้** และเข้าหน้านั้นไม่ได้ (กันทั้งฝั่งเว็บและฝั่ง Edge Function)

---

## เพิ่ม admin คนอื่น
2 วิธี:
- ในหน้าจัดการผู้ใช้ เปลี่ยน role ของคนนั้นเป็น `admin` (วิธีง่ายสุด)
- หรือเพิ่มอีเมลใน secret: `npx supabase secrets set ADMIN_EMAILS="a@x.com,b@y.com"` แล้ว deploy ใหม่

---

## หมายเหตุความปลอดภัย
- `service_role` อยู่ใน Edge Function (ฝั่งเซิร์ฟเวอร์) เท่านั้น **ไม่เคยอยู่ในหน้าเว็บ/Git**
- ฟังก์ชันตรวจสอบ JWT ผู้เรียกทุกครั้งว่าเป็น admin จริงก่อนทำงาน (ไม่ใช่แค่ซ่อนเมนู)
- ถ้ายังไม่ deploy ฟังก์ชัน เมนูจัดการผู้ใช้จะซ่อนอัตโนมัติ และส่วนอื่นของระบบใช้งานได้ปกติ
