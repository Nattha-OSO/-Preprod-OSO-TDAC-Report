// ============================================================
//  Edge Function: send-public-report  (PUBLIC — ไม่ต้องล็อกอิน)
//  ใช้โดยฟอร์มสาธารณะ: ส่ง PDF รายงานการตรวจสอบ TDAC ให้เจ้าหน้าที่ OSO ทางอีเมล
//  กันสแปม: ส่งได้เฉพาะอีเมลที่อยู่ในทะเบียน officers.email เท่านั้น
//  Deploy:  supabase functions deploy send-public-report --no-verify-jwt
//  ใช้ความลับชุดเดียวกับ send-report: BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
// ============================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
function esc(s: string) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const RE_MAIL = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const { to, subject, filename, pdfBase64, message } = body;
    const email = String(to || "").normalize("NFKC").replace(/[^\x21-\x7E]/g, "").toLowerCase();
    if (!RE_MAIL.test(email)) return json({ error: "อีเมลผู้รับไม่ถูกต้อง" }, 400);
    if (!pdfBase64) return json({ error: "ไม่มีไฟล์ PDF แนบ" }, 400);

    // ---- กันสแปม: อีเมลผู้รับต้องมีในทะเบียน officers.email ----
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const q = await fetch(
      url + "/rest/v1/officers?select=email&email=eq." + encodeURIComponent(email) + "&limit=1",
      { headers: { apikey: service, Authorization: "Bearer " + service } },
    );
    const rows = await q.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) {
      return json({ error: "อีเมลนี้ไม่อยู่ในทะเบียนเจ้าหน้าที่ OSO — ให้ผู้ดูแลระบบเพิ่มอีเมลในเมนูจัดการรายชื่อก่อน" }, 403);
    }

    const apiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("SENDER_EMAIL");
    const senderName = Deno.env.get("SENDER_NAME") || "OSO-TDAC Operational Report";
    if (!apiKey || !senderEmail) {
      return json({ error: "ยังไม่ได้ตั้งค่า BREVO_API_KEY / SENDER_EMAIL (ดู SEND-EMAIL.md)" }, 500);
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", "accept": "application/json" },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email }],
        subject: subject || "รายงานการตรวจสอบระบบ TDAC",
        textContent: message || "แนบไฟล์รายงานการตรวจสอบระบบ TDAC (PDF)",
        htmlContent: '<div style="font-family:Tahoma,Arial,sans-serif;white-space:pre-line;font-size:14px;color:#1f2937;line-height:1.6">' + esc(message || "แนบไฟล์รายงานการตรวจสอบระบบ TDAC (PDF)") + "</div>",
        attachment: [{ content: pdfBase64, name: filename || "OSO-TDAC-Report.pdf" }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: "Brevo ปฏิเสธ: " + t.slice(0, 300) }, 500);
    }
    return json({ ok: true, sent: email });
  } catch (e) {
    return json({ error: "ส่งอีเมลไม่สำเร็จ: " + String((e as any)?.message || e) }, 500);
  }
});
