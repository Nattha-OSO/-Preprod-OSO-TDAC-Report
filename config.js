// ============================================================
//  config.js  —  ⚠️ PREPRODUCTION (ระบบทดสอบ) ⚠️
//  ไฟล์นี้ต้องชี้ไปที่ Supabase project "preprod" เท่านั้น
//  ห้ามวางค่าจาก project จริง (production) เด็ดขาด
//
//  หา: Supabase Dashboard -> (project preprod) -> Project Settings -> Data API / API Keys
//   - SUPABASE_URL      = Project URL
//   - SUPABASE_ANON_KEY = anon / public key (เปิดเผยใน client ได้ปลอดภัย เพราะมี RLS คุม)
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://PASTE_PREPROD_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "PASTE_PREPROD_ANON_KEY"
};
