// ============================================================
//  Edge Function: send-report
//  ส่งอีเมลแนบไฟล์รายงาน PDF ผ่าน Brevo HTTP API (ผู้เรียกต้องล็อกอินแล้ว)
//  รองรับภาษาไทย + ไฟล์แนบถูกต้อง 100%
//  Deploy:  supabase functions deploy send-report
//  ตั้งความลับ:
//    supabase secrets set BREVO_API_KEY="xkeysib-..." \
//      SENDER_EMAIL="nattha.b@somapait.com" SENDER_NAME="OSO-TDAC Operational Report"
// ============================================================
import { APPROVED_ROLES, badAttachment, badLinks } from "../_shared/guard.ts";
import { logMail } from "../_shared/maillog.ts";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // ---- ตรวจว่าเป็นผู้ล็อกอิน ----
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const ures = await fetch(url + "/auth/v1/user", { headers: { Authorization: "Bearer " + token, apikey: anon } });
    if (!ures.ok) return json({ error: "unauthorized" }, 401);
    // บัญชีที่ลงทะเบียนแต่ยังไม่อนุมัติก็ได้ JWT — ต้องเช็ก role ด้วย ไม่งั้นใช้ส่งเมลปลอมได้
    const caller = await ures.json().catch(() => ({}));
    const role = caller?.app_metadata?.role || "";
    if (!APPROVED_ROLES.includes(role)) {
      await logMail({ fn: "send-report", status: "blocked", actor: caller?.email, error: "account not approved" });
      return json({ error: "forbidden: account not approved" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { to, subject, filename, pdfBase64, message } = body;
    // รองรับหลายไฟล์แนบ (PDF + DOCX) ผ่าน body.attachments; เผื่อรูปแบบเดิม pdfBase64 ไฟล์เดียว
    const atts = Array.isArray(body.attachments) && body.attachments.length
      ? body.attachments.filter((a: any) => a && a.content).map((a: any) => ({ content: a.content, name: a.name || "report" }))
      : (pdfBase64 ? [{ content: pdfBase64, name: filename || "report.pdf" }] : []);
    if (!to || !atts.length) return json({ error: "ต้องระบุอีเมลผู้รับและไฟล์แนบ" }, 400);
    const recipients = String(to).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) return json({ error: "ไม่มีอีเมลผู้รับ" }, 400);
    if (recipients.length > 20) return json({ error: "ผู้รับเกิน 20 คน" }, 400);
    const actor = caller?.email || null, names = atts.map((a: any) => a.name).join(", ");
    for (const a of atts) {
      const e = badAttachment(a.name, a.content);
      if (e) { await logMail({ fn: "send-report", status: "blocked", actor, recipients: recipients.join(", "), subject, filenames: names, message, error: e }); return json({ error: e }, 400); }
    }
    const le = badLinks(String(subject || "") + " " + String(message || ""), Deno.env.get("APP_URL"));
    if (le) { await logMail({ fn: "send-report", status: "blocked", actor, recipients: recipients.join(", "), subject, filenames: names, message, error: le }); return json({ error: le }, 400); }

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
        to: recipients.map((e) => ({ email: e })),
        subject: subject || "รายงานประเมินเจ้าหน้าที่ Onsite Support",
        textContent: message || "แนบรายงาน PDF",
        htmlContent: '<div style="font-family:Tahoma,Arial,sans-serif;white-space:pre-line;font-size:14px;color:#1f2937;line-height:1.6">' + esc(message || "แนบรายงาน PDF") + "</div>",
        attachment: atts,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      await logMail({ fn: "send-report", status: "failed", actor, recipients: recipients.join(", "), subject, filenames: names, message, error: "Brevo " + res.status });
      return json({ error: "Brevo ปฏิเสธ: " + t.slice(0, 300) }, 500);
    }
    const brevo = await res.json().catch(() => ({}));
    const providerRef = String(brevo?.messageId || brevo?.messageIds?.[0] || "");
    await logMail({ fn: "send-report", status: "sent", actor, recipients: recipients.join(", "), subject, filenames: names, message, providerRef });
    return json({ ok: true, accepted: recipients.length, providerRef });
  } catch (e) {
    return json({ error: "ส่งอีเมลไม่สำเร็จ: " + String((e as any)?.message || e) }, 500);
  }
});
