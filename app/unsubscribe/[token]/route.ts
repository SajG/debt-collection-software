import { NextResponse } from "next/server";
import { setMarketingOptOut } from "@/lib/platform/lifecycle";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-link";

export const dynamic = "force-dynamic";

// SY38 — /unsubscribe/<token> — the link at the bottom of lifecycle
// emails. One click, no sign-in: the signed token names the company.
// GET (a person clicking) and POST (a mail client's one-click
// List-Unsubscribe) do the same thing. Stops getting-started tips for
// that company; account and billing notices are not affected.

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Syncit</title></head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#F5F2EC;color:#1C1917;"><main style="max-width:480px;margin:12vh auto;padding:24px;"><h1 style="font-size:22px;margin:0 0 12px;">${title}</h1><p style="font-size:16px;line-height:1.5;color:#57534E;">${body}</p><p><a href="https://getsyncit.app" style="color:#0D5C4A;">getsyncit.app</a></p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

async function handle(token: string) {
  const organizationId = verifyUnsubscribeToken(decodeURIComponent(token));
  if (!organizationId) {
    return page("This link is not valid", "Reply to any Syncit email and we will take you off the list by hand.", 404);
  }
  await setMarketingOptOut(organizationId);
  return page(
    "You are unsubscribed",
    "We will not send any more getting-started tips. Notices about your account, trial and billing will still reach you.",
  );
}

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  return handle(params.token);
}

export async function POST(_request: Request, { params }: { params: { token: string } }) {
  return handle(params.token);
}
