import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { findPaymentLinkOrg } from "@/lib/platform/resolve";
import { withLockBypass } from "@/lib/platform/billing";

export const dynamic = "force-dynamic";

// Razorpay payment-link webhook. Verified with HMAC-SHA256 of the raw
// body against RAZORPAY_WEBHOOK_SECRET (configure the same secret in the
// Razorpay dashboard → Webhooks).
//
// DELIBERATE SCOPE: this only updates PaymentLink.status so the app stops
// re-sending links that were already paid. It does NOT create Payment
// rows — money is marked received only when a human records it, so a
// misfired or replayed webhook can never move a balance. If auto-recording
// is wanted later, that is a business decision to take explicitly.

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const STATUS_BY_EVENT: Record<string, string> = {
  "payment_link.paid": "paid",
  "payment_link.partially_paid": "partially_paid",
  "payment_link.expired": "expired",
  "payment_link.cancelled": "cancelled",
};

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-razorpay-signature");
  const rawBody = await request.text();

  let payload: {
    event?: string;
    payload?: { payment_link?: { entity?: { id?: string; status?: string } } };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const linkId = payload.payload?.payment_link?.entity?.id;
  const status = payload.event ? STATUS_BY_EVENT[payload.event] : undefined;
  if (!linkId || !status) {
    return NextResponse.json({ received: true });
  }

  // SY22 — resolve the tenant from the PaymentLink's stored org, then
  // verify the signature with THAT tenant's webhook secret. Env
  // fallback lives on the Synergy tenant only (lib/settings/secrets.ts).
  const found = await findPaymentLinkOrg(linkId);
  if (!found) return NextResponse.json({ received: true });
  const link = { id: found.linkId, organizationId: found.organizationId };

  const { getRazorpaySecrets } = await import("@/lib/settings/secrets");
  const secrets = await getRazorpaySecrets(link.organizationId);
  const secret = secrets.webhookSecret;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // SY28 — a customer can pay while the org is LOCKED; keep the link
  // status true so nobody re-sends a paid link after unlocking.
  await withLockBypass(link.organizationId, (tx) =>
    tx.paymentLink.update({
      where: { id: link.id },
      data: { status },
    }),
  );

  return NextResponse.json({ received: true });
}
