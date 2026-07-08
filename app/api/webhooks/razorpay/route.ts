import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

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
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  const rawBody = await request.text();
  if (!signature || !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    event?: string;
    payload?: { payment_link?: { entity?: { id?: string; status?: string } } };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = payload.event ? STATUS_BY_EVENT[payload.event] : undefined;
  const linkId = payload.payload?.payment_link?.entity?.id;
  if (!status || !linkId) {
    // Unknown/uninteresting event — acknowledge so Razorpay stops retrying.
    return NextResponse.json({ received: true });
  }

  await db.paymentLink.updateMany({
    where: { providerLinkId: linkId },
    data: { status },
  });

  return NextResponse.json({ received: true });
}
