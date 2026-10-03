import { NextResponse, type NextRequest } from "next/server";
import { Prisma, type BillingInvoice } from "@prisma/client";
import { tenantDb, type TenantDb } from "@/lib/tenant";
import { sendEmail } from "@/lib/email/send";
import { billingInvoiceEmail } from "@/lib/email/templates";
import { renderBillingInvoicePdf } from "@/lib/pdf/billing-invoice";
import { captureError } from "@/lib/monitoring";
import {
  fetchInvoice,
  fetchSubscription,
  lookupRazorpayPlan,
  verifyBillingSignature,
} from "@/lib/billing/razorpay";
import {
  planTransition,
  type BillingWebhookPayload,
  type SubscriptionEntity,
} from "@/lib/billing/events";
import { findOrgForSubscription, issueBillingInvoice } from "@/lib/platform/billing";

// SY28 — Syncit's own subscription webhook.
//
// Configure in the PLATFORM Razorpay account (the RAZORPAY_PLATFORM_*
// keys), not an org's account: Dashboard → Webhooks → URL
// {APP_URL}/api/webhooks/razorpay-billing, secret =
// RAZORPAY_PLATFORM_WEBHOOK_SECRET, events subscription.* and
// payment.failed.
//
// Flow: verify HMAC → dedupe on x-razorpay-event-id → resolve org via
// subscription id (or notes.organizationId on first sight) → apply the
// pure state transition from lib/billing/events.ts → on
// subscription.charged, issue + email a GST invoice.
//
// payment.failed carries no subscription entity: the subscription is
// looked up (payment.subscription_id, else via its Razorpay invoice)
// and fetched so the same state machine runs. Subscription-less
// payments are acknowledged and ignored.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.RAZORPAY_PLATFORM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Billing webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyBillingSignature(rawBody, request.headers.get("x-razorpay-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: BillingWebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let sub: SubscriptionEntity | undefined = body.payload?.subscription?.entity;
  if (!sub && body.event === "payment.failed") {
    const payment = body.payload?.payment?.entity;
    try {
      const subId =
        payment?.subscription_id ??
        (payment?.invoice_id ? (await fetchInvoice(payment.invoice_id)).subscription_id : null);
      if (subId) sub = await fetchSubscription(subId);
    } catch (e) {
      // Retry later: Razorpay re-delivers on non-2xx.
      await captureError(e, { scope: "webhook.razorpay-billing.payment-failed" });
      return NextResponse.json({ error: "Could not resolve subscription" }, { status: 502 });
    }
    if (sub) body = { ...body, payload: { ...body.payload, subscription: { entity: sub } } };
  }
  const isBillingEvent = body.event?.startsWith("subscription.") || body.event === "payment.failed";
  if (!isBillingEvent || !sub) {
    return NextResponse.json({ received: true });
  }
  // The platform account may bill other products too (webhooks are
  // account-wide). Only subscriptions this app created carry app=syncit.
  if (sub.notes?.app !== "syncit") {
    return NextResponse.json({ received: true, ignored: "not a Syncit subscription" });
  }

  const org = await findOrgForSubscription(sub.id, sub.notes?.organizationId);
  if (!org) {
    // Unknown subscription — ack so Razorpay stops retrying, but log.
    await captureError(new Error("billing webhook: no org for subscription"), {
      scope: "webhook.razorpay-billing",
      subscriptionId: sub.id,
      event: body.event,
    });
    return NextResponse.json({ received: true });
  }

  // SY32 — everything below touches only this company's rows.
  const db = tenantDb(org.id);

  // Idempotency. Razorpay retries until 2xx; a replay is a no-op.
  const eventId =
    request.headers.get("x-razorpay-event-id") ??
    `${body.event}:${sub.id}:${body.payload.payment?.entity.id ?? body.created_at ?? ""}`;
  try {
    await db.billingEvent.create({
      data: { id: eventId, event: body.event, organizationId: org.id },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw e;
  }

  try {
    const transition = planTransition(body, org, lookupRazorpayPlan);
    if (transition.kind === "ignore") {
      return NextResponse.json({ received: true, ignored: transition.reason });
    }

    await db.organization.update({
      where: { id: org.id },
      data: {
        ...transition.patch,
        ...(org.razorpaySubscriptionId ? {} : { razorpaySubscriptionId: sub.id }),
      },
    });

    const payment = body.payload.payment?.entity;
    const mapped = lookupRazorpayPlan(sub.plan_id);
    if (transition.issueInvoice && payment && mapped) {
      const invoice = await issueBillingInvoice({
        organizationId: org.id,
        planId: mapped.planId,
        cycle: mapped.cycle,
        razorpayPaymentId: payment.id,
        razorpayInvoiceId: payment.invoice_id ?? null,
        razorpaySubscriptionId: sub.id,
        totalPaise: payment.amount,
        periodStart: sub.current_start ? new Date(sub.current_start * 1000) : null,
        periodEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
      });
      // Best-effort: a mail failure never fails the webhook (the
      // invoice is always downloadable from Settings → Billing).
      if (invoice) {
        await emailBillingInvoice(db, invoice).catch((e) =>
          captureError(e, { scope: "webhook.razorpay-billing.invoice-email", orgId: org.id }),
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    // Drop the idempotency row so Razorpay's retry reprocesses.
    await db.billingEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    await captureError(e, { scope: "webhook.razorpay-billing", event: body.event, orgId: org.id });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function emailBillingInvoice(db: TenantDb, invoice: BillingInvoice): Promise<void> {
  const owner = await db.membership.findFirst({
    where: { isOwner: true, isActive: true },
    select: { profile: { select: { email: true, ownerName: true } } },
  });
  if (!owner?.profile.email) return;
  const buffer = await renderBillingInvoicePdf(invoice);
  const tmpl = billingInvoiceEmail({
    ownerName: owner.profile.ownerName,
    companyName: invoice.customerName,
    invoiceNumber: invoice.invoiceNumber,
    amountText: `₹${(invoice.totalPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
  });
  await sendEmail({
    to: owner.profile.email,
    ...tmpl,
    attachments: [
      {
        filename: `${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`,
        content: buffer.toString("base64"),
      },
    ],
  });
}
