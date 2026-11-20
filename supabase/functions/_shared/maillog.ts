// Server-side mail audit (service role -> bypasses RLS). Never throws: logging must not break sending.
// Needs table public.email_log (migration-email-log.sql). Stores metadata + message excerpt, NOT attachment bytes.
export async function logMail(r: {
  fn: string; status: "sent" | "failed" | "blocked"; actor?: string | null; recipients?: string;
  subject?: string; filenames?: string; message?: string; error?: string;
  providerRef?: string;
}) {
  try {
    const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(url + "/rest/v1/email_log", {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        fn: r.fn, status: r.status, actor: r.actor ?? null, recipients: (r.recipients || "").slice(0, 500),
        subject: (r.subject || "").slice(0, 300), filenames: (r.filenames || "").slice(0, 300),
        message: (r.message || "").slice(0, 2000), error: (r.error || "").slice(0, 500) || null,
        provider_ref: (r.providerRef || "").slice(0, 200) || null,
      }),
    });
  } catch (_) { /* ignore */ }
}
