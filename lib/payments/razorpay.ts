// Razorpay Payment Links via REST (no SDK). Supports UPI and partial
// payments. SERVER-ONLY — uses the company's secret key.

import type { TenantClient } from "@/lib/tenant";
import { getRazorpaySecrets } from "@/lib/settings/secrets";

const API_BASE = "https://api.razorpay.com/v1";

export type RazorpayCreds = { keyId: string; keySecret: string };

/**
 * The company's OWN Razorpay key pair (Settings → Payments), or null
 * when it has none. Money from a "Pay now" link lands in that company's
 * Razorpay account, so there is deliberately no shared fallback: a
 * company without keys gets no link. (The env pair is honoured only
 * for the legacy Synergy tenant — see lib/settings/secrets.ts.)
 */
export async function razorpayCredsFor(organizationId: string): Promise<RazorpayCreds | null> {
  const { keyId, keySecret } = await getRazorpaySecrets(organizationId);
  return keyId && keySecret ? { keyId, keySecret } : null;
}

function authHeader(creds: RazorpayCreds): string {
  return `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`;
}

export type PaymentLinkResult =
  | { ok: true; shortUrl: string }
  | { ok: false; error: string };

/**
 * Create (or reuse an open) payment link for a party/invoice and persist it.
 * Partial payments are enabled with a ₹100 minimum instalment.
 */
export async function getOrCreatePaymentLink(
  db: TenantClient,
  creds: RazorpayCreds | null,
  params: {
  partyId: string;
  invoiceId?: string | null;
  amount: number; // ₹
  partyName: string;
  phone?: string | null;
  email?: string | null;
  description: string;
}): Promise<PaymentLinkResult> {
  if (!creds) {
    return { ok: false, error: "Razorpay is not configured for this company" };
  }

  // Reuse an open link instead of minting a new one every time: the
  // same invoice, or — for a whole-account link (statement, account
  // reminder) — the same customer and amount within the last 7 days.
  const existing = await db.paymentLink.findFirst({
    where: params.invoiceId
      ? { invoiceId: params.invoiceId, status: { in: ["created", "partially_paid"] } }
      : {
          partyId: params.partyId,
          invoiceId: null,
          amount: params.amount,
          status: "created",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { ok: true, shortUrl: existing.shortUrl };

  try {
    const res = await fetch(`${API_BASE}/payment_links`, {
      method: "POST",
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(params.amount * 100), // paise
        currency: "INR",
        accept_partial: true,
        first_min_partial_amount: 10000, // ₹100
        description: params.description.slice(0, 255),
        customer: {
          name: params.partyName,
          ...(params.phone ? { contact: `+91${params.phone}` } : {}),
          ...(params.email ? { email: params.email } : {}),
        },
        notify: { sms: false, email: false }, // we deliver the link ourselves
        reference_id: `${params.invoiceId ?? params.partyId}-${Date.now()}`,
      }),
    });

    const data = (await res.json()) as {
      id?: string;
      short_url?: string;
      status?: string;
      error?: { description?: string };
    };

    if (!res.ok || !data.id || !data.short_url) {
      return {
        ok: false,
        error: data.error?.description ?? `Razorpay error (HTTP ${res.status})`,
      };
    }

    await db.paymentLink.create({
      data: {
        partyId: params.partyId,
        invoiceId: params.invoiceId ?? null,
        providerLinkId: data.id,
        shortUrl: data.short_url,
        amount: params.amount,
        status: data.status ?? "created",
      },
    });

    return { ok: true, shortUrl: data.short_url };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Razorpay request failed",
    };
  }
}
