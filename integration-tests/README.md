# Integration tests (ไม่รวมในชุด test-*.cjs ปกติ)

ต้องติดตั้งแพ็กเกจในโฟลเดอร์ที่รัน: `npm i --no-save playwright-core @electric-sql/pglite`
(ใช้ Edge ที่ `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` และ path โปรเจกต์ที่ตั้งไว้ในไฟล์ — แก้ให้ตรงเครื่องก่อนรัน)

| ไฟล์ | ทดสอบอะไร |
|---|---|
| `sql-edit-link.test.mjs` | `migration-edit-link.sql` กับ PostgreSQL จริง (PGlite): โทเค็น/แฮช, หมดอายุ, ล็อกวันที่-รอบ-ผู้ตรวจ, โทเค็นข้ามรายงานไม่ได้, รันซ้ำได้ |
| `edit-link.e2e.cjs [URL]` | ลิงก์แก้ไขในเบราว์เซอร์จริง โดยจำลอง Supabase (ไม่เขียนข้อมูลจริง) — ใส่ URL เว็บที่ deploy แล้วเพื่อทดสอบเว็บจริงได้ |

ตัวแปร `EDIT_SQL=<ไฟล์>` ให้ `sql-edit-link.test.mjs` ทดสอบ SQL ที่ถูกแก้ (mutation) เพื่อพิสูจน์ว่าเทสต์จับความผิดได้
