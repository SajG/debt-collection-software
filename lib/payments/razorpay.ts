// Razorpay Payment Links via REST (no SDK). Supports UPI and partial
// payments. SERVER-ONLY — uses the secret key.

import { db } from "@/lib/db";

const API_BASE = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function authHeader(): string {
  const creds = `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

export type PaymentLinkResult =
  | { ok: true; shortUrl: string }
  | { ok: false; error: string };

/**
 * Create (or reuse an open) payment link for a party/invoice and persist it.
 * Partial payments are enabled with a ₹100 minimum instalment.
 */
export async function getOrCreatePaymentLink(params: {
  partyId: string;
  invoiceId?: string | null;
  amount: number; // ₹
  partyName: string;
  phone?: string | null;
  email?: string | null;
  description: string;
}): Promise<PaymentLinkResult> {
  if (!razorpayConfigured()) {
    return { ok: false, error: "Razorpay is not configured" };
  }

  // Reuse an existing open link for the same invoice to avoid duplicates.
  if (params.invoiceId) {
    const existing = await db.paymentLink.findFirst({
      where: {
        invoiceId: params.invoiceId,
        status: { in: ["created", "partially_paid"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { ok: true, shortUrl: existing.shortUrl };
  }

  try {
    const res = await fetch(`${API_BASE}/payment_links`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
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
