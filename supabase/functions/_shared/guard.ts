// Shared abuse guards for the mail-sending Edge Functions.
export const APPROVED_ROLES = ["admin", "senior", "manager"];

// Only plain .docx (what the app generates); blocks .docm/macros/OLE/ActiveX payloads.
export function badAttachment(name: unknown, b64: unknown): string | null {
  if (!/\.docx$/i.test(String(name || ""))) return "อนุญาตเฉพาะไฟล์ .docx";
  let bin: string;
  try { bin = atob(String(b64 || "")); } catch { return "ไฟล์แนบไม่ถูกต้อง"; }
  if (bin.length > 10 * 1024 * 1024) return "ไฟล์แนบใหญ่เกิน 10MB";
  if (!bin.startsWith("PK\x03\x04")) return "เนื้อไฟล์ไม่ใช่ .docx";
  // zip entry names are stored uncompressed, so a byte scan finds them
  if (/vbaProject|vbaData|activeX|oleObject|embeddings\/|macroEnabled/i.test(bin)) return "ไฟล์มีมาโคร/วัตถุฝัง — ไม่อนุญาต";
  return null;
}

// ponytail: fixed host allowlist (prod Vercel + preprod Pages) + APP_URL; extend if the app moves.
export function badLinks(text: unknown, appUrl?: string): string | null {
  const hosts = ["oso-tdac-report.vercel.app", "nattha-oso.github.io"];
  try { if (appUrl) hosts.push(new URL(appUrl).host); } catch { /* ignore */ }
  for (const m of String(text || "").match(/https?:\/\/[^\s<>"')]+/gi) || []) {
    let h = "";
    try { h = new URL(m).host.toLowerCase(); } catch { return "ลิงก์ไม่ถูกต้อง"; }
    if (!hosts.includes(h)) return "ไม่อนุญาตลิงก์ภายนอก: " + h;
  }
  return null;
}
