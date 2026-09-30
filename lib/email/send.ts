import { captureError } from "@/lib/monitoring";

// SY23 — Resend HTTP wrapper.
//
// One transport for every branded email we send server-side. Auth-
// OTP emails go through Supabase → their own SMTP (Resend from the
// dashboard); this module handles our own product mail: welcome,
// trial reminders, team-invite copy, etc.
//
// No dependency on the resend SDK — a plain fetch keeps the bundle
// small and doesn't need extra typings. `RESEND_API_KEY` is required;
// unset means every send is a no-op (dev / preview safe).

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM =
  process.env.EMAIL_FROM ?? "Syncit <login@getsyncit.app>";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Never throw: an unconfigured environment (preview, local dev)
    // should log + skip cleanly, not break a signup flow.
    console.info("[email] RESEND_API_KEY missing; skipping send", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: false, error: "RESEND_API_KEY missing" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await captureError(new Error(`Resend send failed ${res.status}`), {
        scope: "email.send",
        to: input.to,
        body: body.slice(0, 400),
      });
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id ?? "" };
  } catch (e) {
    await captureError(e, { scope: "email.send", to: input.to });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
