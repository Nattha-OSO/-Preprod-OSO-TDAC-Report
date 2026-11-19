// node test-mail-guard.mjs — checks the mail-abuse guard used by send-report / send-public-report
import assert from "node:assert";
import { badAttachment, badLinks } from "./supabase/functions/_shared/guard.ts";

const b64 = (s) => Buffer.from(s, "latin1").toString("base64");
const docx = b64("PK\x03\x04....word/document.xml....");
assert.equal(badAttachment("r.docx", docx), null);
assert.ok(badAttachment("TDAC-Security-Update.docm", docx), ".docm blocked");
assert.ok(badAttachment("r.docx", b64("PK\x03\x04..word/vbaProject.bin..")), "macro inside .docx blocked");
assert.ok(badAttachment("r.docx", b64("MZ\x90\x00 exe")), "non-zip blocked");
assert.ok(badAttachment("r.exe", docx));

assert.equal(badLinks("เปิด https://oso-tdac-report.vercel.app/#edit=1.abc"), null);
assert.equal(badLinks("no links"), null);
assert.ok(badLinks("อัปเดตที่ https://evil.example/update"));
assert.ok(badLinks("https://oso-tdac-report.vercel.app.evil.com/x"));
assert.equal(badLinks("https://x.example/a", "https://x.example/"), null, "APP_URL host allowed");
console.log("mail guard OK");
