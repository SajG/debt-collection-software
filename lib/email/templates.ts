// SY23 — branded email templates.
//
// Plain, mobile-friendly HTML. Every template has an English body
// plus one Hindi line so a bilingual owner immediately recognises
// it isn't just another provider notice.
//
// The Supabase Auth "email OTP" template lives in the Supabase
// dashboard (docs/EMAIL-TEMPLATES.md); it is NOT rendered from
// here. This module covers our own product mail.

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://getsyncit.app").replace(/\/+$/, "");
const HELP_EMAIL = process.env.SUPPORT_EMAIL ?? "help@getsyncit.app";

type Template = { subject: string; html: string; text: string };

function shell(bodyHtml: string, hindiLine: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F5F2EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1C1917;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:24px;">
      <tr>
        <td style="padding-bottom:16px;">
          <a href="${APP_URL}" style="text-decoration:none;color:#0D5C4A;font-weight:700;font-size:18px;">Syncit</a>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border:1px solid #DDD8CF;border-radius:12px;padding:24px;">
          ${bodyHtml}
          <p style="margin:18px 0 0;color:#57534E;font-size:13px;line-height:1.5;">${hindiLine}</p>
        </td>
      </tr>
      <tr>
        <td style="padding-top:16px;font-size:12px;color:#A8A29E;">
          Questions? Reply to this email or write to
          <a href="mailto:${HELP_EMAIL}" style="color:#0D5C4A;">${HELP_EMAIL}</a>.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function welcomeEmail(input: {
  ownerName: string;
  companyName: string;
  trialEndsAt: Date;
}): Template {
  const subject = `Welcome to Syncit, ${input.ownerName}`;
  const trialDate = input.trialEndsAt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1C1917;">Welcome, ${escape(input.ownerName)}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
      Your workspace <strong>${escape(input.companyName)}</strong> is ready. Your 14-day trial runs until <strong>${trialDate}</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
      Next steps: invite your team, connect Tally or upload a spreadsheet, and place your first order.
    </p>
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">Open Syncit</a>
  `;
  const hindiLine = "Syncit में आपका स्वागत है — 14 दिन का ट्रायल शुरू हो गया है।";
  const text = `Welcome to Syncit, ${input.ownerName}.

Your workspace "${input.companyName}" is ready. Trial ends ${trialDate}.

Open your dashboard: ${APP_URL}/dashboard

— Syncit team`;
  return { subject, html: shell(bodyHtml, hindiLine), text };
}

export function trialEndingSoonEmail(input: {
  ownerName: string;
  companyName: string;
  daysLeft: number;
  trialEndsAt: Date;
}): Template {
  const subject = `${input.daysLeft} days left on your Syncit trial`;
  const trialDate = input.trialEndsAt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1C1917;">Trial ending soon</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
      Hi ${escape(input.ownerName)} — your Syncit trial for <strong>${escape(input.companyName)}</strong> ends on <strong>${trialDate}</strong> (${input.daysLeft} days from now).
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
      Reply to this email to talk pricing, or choose a plan in Settings → Billing.
    </p>
    <a href="${APP_URL}/settings/billing" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">Choose a plan</a>
  `;
  const hindiLine = `आपका ट्रायल ${input.daysLeft} दिनों में समाप्त हो जाएगा।`;
  const text = `Hi ${input.ownerName}, your Syncit trial ends on ${trialDate} (${input.daysLeft} days from now).

Choose a plan: ${APP_URL}/settings/billing

— Syncit team`;
  return { subject, html: shell(bodyHtml, hindiLine), text };
}

export function trialEndedEmail(input: {
  ownerName: string;
  companyName: string;
}): Template {
  const subject = "Your Syncit trial has ended";
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1C1917;">Trial ended</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
      Hi ${escape(input.ownerName)} — the free trial for <strong>${escape(input.companyName)}</strong> has ended. Nothing is deleted — your team can still sign in, view and export everything. Editing is paused until you pick a plan.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
      Pick a plan to switch editing back on straight away, or reply and we&apos;ll help.
    </p>
    <a href="${APP_URL}/settings/billing" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">Choose a plan</a>
  `;
  const hindiLine = "ट्रायल पूरा हो गया — कोई भी डेटा नहीं मिटाया गया है।";
  const text = `Hi ${input.ownerName}, your Syncit trial for "${input.companyName}" has ended. Nothing is deleted — you can still sign in, view and export. Editing is paused until you pick a plan.

Choose a plan: ${APP_URL}/settings/billing

— Syncit team`;
  return { subject, html: shell(bodyHtml, hindiLine), text };
}

export function billingInvoiceEmail(input: {
  ownerName: string;
  companyName: string;
  invoiceNumber: string;
  amountText: string;
}): Template {
  const subject = `Syncit tax invoice ${input.invoiceNumber}`;
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1C1917;">Payment received — thank you</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
      Hi ${escape(input.ownerName)} — we received ${escape(input.amountText)} for <strong>${escape(input.companyName)}</strong>'s Syncit subscription. Your GST tax invoice <strong>${escape(input.invoiceNumber)}</strong> is attached.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
      All past invoices are in Settings → Billing.
    </p>
    <a href="${APP_URL}/settings/billing" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">Open billing</a>
  `;
  const hindiLine = "भुगतान मिल गया — GST इनवॉइस साथ में है।";
  const text = `Hi ${input.ownerName}, we received ${input.amountText} for ${input.companyName}'s Syncit subscription. Your GST tax invoice ${input.invoiceNumber} is attached.

All past invoices: ${APP_URL}/settings/billing

— Syncit team`;
  return { subject, html: shell(bodyHtml, hindiLine), text };
}

export function paymentLockedEmail(input: {
  ownerName: string;
  companyName: string;
}): Template {
  const subject = "Your Syncit workspace is read-only";
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1C1917;">Payment still pending</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
      Hi ${escape(input.ownerName)} — we couldn't collect the Syncit renewal for <strong>${escape(input.companyName)}</strong> for 7 days, so the workspace is now read-only. Nothing is deleted — your team can still sign in, view and export everything.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
      Pay from Settings → Billing and editing switches back on straight away.
    </p>
    <a href="${APP_URL}/settings/billing" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">Pay now</a>
  `;
  const hindiLine = "भुगतान बाकी है — कोई भी डेटा नहीं मिटाया गया है।";
  const text = `Hi ${input.ownerName}, we couldn't collect the Syncit renewal for "${input.companyName}" for 7 days, so the workspace is now read-only. Nothing is deleted — you can still sign in, view and export.

Pay now: ${APP_URL}/settings/billing

— Syncit team`;
  return { subject, html: shell(bodyHtml, hindiLine), text };
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export function companyDeletionScheduledEmail(input: {
  ownerName: string;
  companyName: string;
  scheduledFor: Date;
}): Template {
  const when = longDate(input.scheduledFor);
  const subject = `${input.companyName} will be deleted on ${when}`;
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1C1917;">Company deletion scheduled</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
      Hi ${escape(input.ownerName)} — <strong>${escape(input.companyName)}</strong> is now read-only and will be permanently deleted on <strong>${escape(when)}</strong>: every order, invoice, payment, customer and uploaded file.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
      Download your data before then. Changed your mind? Cancel the deletion from Settings → Company any time before that date.
    </p>
    <a href="${APP_URL}/settings/company" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">Download data or cancel</a>
  `;
  const hindiLine = "कंपनी डिलीट होने वाली है — उससे पहले अपना डेटा डाउनलोड कर लें।";
  const text = `Hi ${input.ownerName}, ${input.companyName} is now read-only and will be permanently deleted on ${when}. Download your data before then, or cancel from Settings → Company: ${APP_URL}/settings/company

— Syncit team`;
  return { subject, html: shell(bodyHtml, hindiLine), text };
}

export function companyDeletionReminderEmail(input: {
  ownerName: string;
  companyName: string;
  scheduledFor: Date;
}): Template {
  const when = longDate(input.scheduledFor);
  const subject = `Reminder: ${input.companyName} will be deleted on ${when}`;
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1C1917;">5 days left</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
      Hi ${escape(input.ownerName)} — on <strong>${escape(when)}</strong> we permanently delete all data for <strong>${escape(input.companyName)}</strong>. After that it can't be recovered.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
      Download your data now, or cancel the deletion if you want to keep using Syncit.
    </p>
    <a href="${APP_URL}/settings/company" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">Download data or cancel</a>
  `;
  const hindiLine = "5 दिन बाकी — डेटा डाउनलोड करें या डिलीट रद्द करें।";
  const text = `Hi ${input.ownerName}, on ${when} we permanently delete all data for ${input.companyName}. Download it now or cancel: ${APP_URL}/settings/company

— Syncit team`;
  return { subject, html: shell(bodyHtml, hindiLine), text };
}

function escape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
