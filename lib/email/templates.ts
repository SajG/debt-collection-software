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

function shell(bodyHtml: string, hindiLine: string, unsubscribeUrl?: string): string {
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
          <a href="mailto:${HELP_EMAIL}" style="color:#0D5C4A;">${HELP_EMAIL}</a>.${
            unsubscribeUrl
              ? `<br>Don't want getting-started tips? <a href="${unsubscribeUrl}" style="color:#A8A29E;">Unsubscribe</a>. Account and billing notices will still reach you.`
              : ""
          }
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

// ── SY38 lifecycle emails ─────────────────────────────────────────
// Sent by /api/cron/lifecycle, each at most once per company, and only
// while the step it nudges is still undone. All carry an unsubscribe
// link (company-wide opt-out of these tips; account notices continue).

const cta = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a>`;
const para = (html: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${html}</p>`;
const heading = (text: string) =>
  `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#1C1917;">${text}</h1>`;

type LifecycleInput = { ownerName: string; companyName: string; unsubscribeUrl: string };

/** Day 1 — bring your customers and invoices in. Skipped once any data is in. */
export function connectDataEmail(input: LifecycleInput): Template {
  const subject = "Bring your customers and outstanding into Syncit";
  const bodyHtml = `
    ${heading(`${escape(input.ownerName)}, your outstanding list is 10 minutes away`)}
    ${para(`<strong>${escape(input.companyName)}</strong> is set up, but it has no customers or invoices yet. There are two ways to bring them in:`)}
    ${para(`<strong>If you use Tally</strong> — install the small connector on the PC that runs Tally. Customers, bills and receipts then come in on their own.`)}
    ${para(`<strong>If you use Excel</strong> — upload your customer list and unpaid bills as a sheet. Our template has the right columns.`)}
    <p style="margin:16px 0 8px;">${cta(`${APP_URL}/settings/tally`, "Connect Tally")}</p>
    ${para(`or <a href="${APP_URL}/import" style="color:#0D5C4A;">upload an Excel sheet</a> · <a href="${APP_URL}/help/connect-tally" style="color:#0D5C4A;">step-by-step guide</a>`)}
  `;
  const hindiLine = "Tally जोड़ें या Excel अपलोड करें — आपके ग्राहक और बकाया बिल अपने आप आ जाएँगे।";
  const text = `${input.ownerName}, ${input.companyName} has no customers or invoices in Syncit yet.

Using Tally? Connect it: ${APP_URL}/settings/tally
Using Excel? Upload a sheet: ${APP_URL}/import
Guide: ${APP_URL}/help/connect-tally

Unsubscribe from these tips: ${input.unsubscribeUrl}`;
  return { subject, html: shell(bodyHtml, hindiLine, input.unsubscribeUrl), text };
}

/** Day 3 — invite the sales team. Skipped once a second person exists. */
export function inviteTeamEmail(input: LifecycleInput): Template {
  const subject = "Add your sales team to Syncit";
  const bodyHtml = `
    ${heading("Syncit works when your team is in it")}
    ${para(`Hi ${escape(input.ownerName)} — right now you are the only person in <strong>${escape(input.companyName)}</strong>. Orders still reach you on WhatsApp and you are the one typing them in.`)}
    ${para(`Add each salesperson with their name, phone and work email. They get an email, install the app, and sign in with a 6-digit code — no password to remember. Each one sees only their own customers.`)}
    ${para(`Add one person from the factory or dispatch too, so orders show up on their phone the moment they are placed.`)}
    <p style="margin:16px 0 8px;">${cta(`${APP_URL}/admin/users`, "Invite your team")}</p>
    ${para(`<a href="${APP_URL}/help/invite-team" style="color:#0D5C4A;">How inviting works</a> · <a href="${APP_URL}/help/roles-explained" style="color:#0D5C4A;">What each role can see</a>`)}
  `;
  const hindiLine = "अपनी सेल्स टीम को जोड़ें — हर सेल्समैन को सिर्फ अपने ग्राहक दिखेंगे।";
  const text = `Hi ${input.ownerName}, you are the only person in ${input.companyName} on Syncit.

Invite your salespeople and one factory user: ${APP_URL}/admin/users
How it works: ${APP_URL}/help/invite-team

Unsubscribe from these tips: ${input.unsubscribeUrl}`;
  return { subject, html: shell(bodyHtml, hindiLine, input.unsubscribeUrl), text };
}

/** Day 30 — the trial ended and no plan was chosen. */
export function winBackEmail(input: LifecycleInput): Template {
  const subject = `${input.companyName} is still here when you are ready`;
  const bodyHtml = `
    ${heading("Your data is safe — and waiting")}
    ${para(`Hi ${escape(input.ownerName)} — the trial for <strong>${escape(input.companyName)}</strong> ended a couple of weeks ago. Nothing has been deleted: your customers, orders and outstanding are all still there, read-only.`)}
    ${para(`If the timing was wrong, or something did not work the way you needed, reply to this email and tell us. A person reads every reply.`)}
    ${para(`If you would like to pick up where you left off, choosing a plan unlocks everything straight away.`)}
    <p style="margin:16px 0 8px;">${cta(`${APP_URL}/settings/billing`, "See plans")}</p>
  `;
  const hindiLine = "आपका डेटा सुरक्षित है। जब चाहें प्लान चुनकर वहीं से शुरू करें।";
  const text = `Hi ${input.ownerName}, the Syncit trial for ${input.companyName} has ended. Nothing was deleted.

Reply to tell us what did not work, or choose a plan to continue: ${APP_URL}/settings/billing

Unsubscribe from these tips: ${input.unsubscribeUrl}`;
  return { subject, html: shell(bodyHtml, hindiLine, input.unsubscribeUrl), text };
}

const inr = (n: number) =>
  (n < 0 ? "-" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");

/** SY29 — Monday email to a company's managers. */
export function weeklySummaryEmail(input: {
  managerName: string;
  companyName: string;
  weekOf: Date;
  summary: {
    outstanding: number;
    overdueNow: number;
    overdueLastWeek: number;
    overdueChange: number;
    overdueChangePct: number | null;
    receivedThisWeek: number;
    receivedThisMonth: number;
    monthTarget: number;
    targetPct: number | null;
    topOverdue: { name: string; overdue: number; daysOverdue: number; salesperson: string | null }[];
    brokenPromises: {
      name: string;
      promiseDate: Date;
      promiseAmount: number | null;
      outstanding: number;
      salesperson: string | null;
    }[];
  };
}): Template {
  const s = input.summary;
  const subject = `${input.companyName}: ${inr(s.outstanding)} outstanding, ${inr(s.overdueNow)} overdue — week of ${longDate(input.weekOf)}`;

  const trend =
    s.overdueChange === 0
      ? "unchanged from last week"
      : `${s.overdueChange > 0 ? "up" : "down"} ${inr(Math.abs(s.overdueChange))}${
          s.overdueChangePct === null ? "" : ` (${Math.abs(s.overdueChangePct)}%)`
        } from last week`;
  const trendColour = s.overdueChange > 0 ? "#B42318" : s.overdueChange < 0 ? "#0D5C4A" : "#57534E";
  const target =
    s.targetPct === null
      ? "No target set for this month."
      : `${s.targetPct}% of the ${inr(s.monthTarget)} target.`;

  const cell = "padding:6px 8px;border-bottom:1px solid #EFEBE4;font-size:13px;";
  const num = `${cell}text-align:right;white-space:nowrap;`;
  const tile = (label: string, value: string, sub: string, subColour = "#57534E") => `
    <td style="padding:10px 12px;border:1px solid #DDD8CF;border-radius:8px;vertical-align:top;width:50%;">
      <div style="font-size:12px;color:#57534E;">${label}</div>
      <div style="font-size:20px;font-weight:700;margin:2px 0;">${value}</div>
      <div style="font-size:12px;color:${subColour};">${sub}</div>
    </td>`;

  const overdueRows = s.topOverdue.length
    ? s.topOverdue
        .map(
          (r, i) => `<tr>
            <td style="${cell}">${i + 1}. ${escape(r.name)}${r.salesperson ? `<br><span style="color:#A8A29E;">${escape(r.salesperson)}</span>` : ""}</td>
            <td style="${num}">${r.daysOverdue} d</td>
            <td style="${num}"><strong>${inr(r.overdue)}</strong></td>
          </tr>`,
        )
        .join("")
    : `<tr><td style="${cell}" colspan="3">Nothing is overdue.</td></tr>`;

  const promiseRows = s.brokenPromises.length
    ? s.brokenPromises
        .map(
          (r) => `<tr>
            <td style="${cell}">${escape(r.name)}${r.salesperson ? `<br><span style="color:#A8A29E;">${escape(r.salesperson)}</span>` : ""}</td>
            <td style="${num}">${r.promiseAmount === null ? "" : `${inr(r.promiseAmount)} `}by ${longDate(r.promiseDate)}</td>
            <td style="${num}"><strong>${inr(r.outstanding)}</strong></td>
          </tr>`,
        )
        .join("")
    : `<tr><td style="${cell}" colspan="3">No missed promises.</td></tr>`;

  const h2 = "margin:22px 0 6px;font-size:15px;color:#1C1917;";
  const bodyHtml = `
    <h1 style="margin:0 0 4px;font-size:20px;line-height:1.3;color:#1C1917;">${escape(input.companyName)} — weekly summary</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#57534E;">Hi ${escape(input.managerName)}, here is where things stand this Monday.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;">
      <tr>
        ${tile("Total outstanding", inr(s.outstanding), "across all customers")}
        ${tile("Overdue", inr(s.overdueNow), trend, trendColour)}
      </tr>
      <tr>
        ${tile("Received this month", inr(s.receivedThisMonth), target)}
        ${tile("Received in the last 7 days", inr(s.receivedThisWeek), "payments recorded")}
      </tr>
    </table>
    <h2 style="${h2}">Top overdue customers</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${overdueRows}</table>
    <h2 style="${h2}">Missed payment promises</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${promiseRows}</table>
    <p style="margin:20px 0 0;">
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#0D5C4A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">Open Syncit</a>
    </p>
  `;
  const hindiLine = `इस हफ्ते: कुल बकाया ${inr(s.outstanding)}, जिसमें ${inr(s.overdueNow)} की तारीख निकल चुकी है।`;

  const text = [
    `${input.companyName} — weekly summary (${longDate(input.weekOf)})`,
    ``,
    `Total outstanding: ${inr(s.outstanding)}`,
    `Overdue: ${inr(s.overdueNow)} (${trend})`,
    `Received this month: ${inr(s.receivedThisMonth)}. ${target}`,
    `Received in the last 7 days: ${inr(s.receivedThisWeek)}`,
    ``,
    `Top overdue customers:`,
    ...(s.topOverdue.length
      ? s.topOverdue.map((r, i) => `${i + 1}. ${r.name} — ${inr(r.overdue)}, ${r.daysOverdue} days`)
      : ["Nothing is overdue."]),
    ``,
    `Missed payment promises:`,
    ...(s.brokenPromises.length
      ? s.brokenPromises.map(
          (r) => `- ${r.name} — promised ${r.promiseAmount === null ? "" : `${inr(r.promiseAmount)} `}by ${longDate(r.promiseDate)}; owes ${inr(r.outstanding)}`,
        )
      : ["No missed promises."]),
    ``,
    `${APP_URL}/dashboard`,
  ].join("\n");

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
