import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function safeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// Meta signs every POST with X-Hub-Signature-256 = 'sha256=' + hex(HMAC-SHA256(
// appSecret, rawBody)). WHATSAPP_APP_SECRET is the "App Secret" from the
// Meta app dashboard, distinct from the phone verify token. Without this
// check the endpoint was writing Message + Party rows on anonymous input.
function verifySignature(secret: string, header: string | null, rawBody: string): boolean {
  if (!header) return false;
  const [scheme, digest] = header.split("=");
  if (scheme !== "sha256" || !digest) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeStringEqual(digest, expected);
}

// Meta webhook verification handshake (configure the same token in the
// Meta app dashboard and WHATSAPP_WEBHOOK_VERIFY_TOKEN).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    mode === "subscribe" &&
    expected &&
    token &&
    challenge &&
    safeStringEqual(token, expected)
  ) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "optout", "opt-out", "band karo"]);

type StatusEvent = {
  id?: string;
  status?: string; // sent | delivered | read | failed
  errors?: { title?: string }[];
};

type InboundMessage = {
  from?: string; // wa_id, e.g. "919876543210"
  id?: string;
  text?: { body?: string };
  type?: string;
};

// Delivery statuses + inbound replies. Inbound "STOP" is a one-step opt-out:
// consent flips to OPTED_OUT immediately, which the gate enforces on every
// channel — no confirmation step, no human in the loop.
export async function POST(request: NextRequest) {
  // MUST read raw text before parsing — Meta's HMAC is over the exact
  // bytes they posted, so `JSON.parse` + re-stringify would fail.
  const rawBody = await request.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Fail closed: without the app secret we cannot prove Meta sent
    // this. The endpoint previously accepted anonymous POSTs and would
    // write Message + Party rows for anyone who guessed a
    // providerMessageId or phone.
    return NextResponse.json(
      { error: "Webhook signing secret not configured" },
      { status: 500 },
    );
  }
  if (
    !verifySignature(
      appSecret,
      request.headers.get("x-hub-signature-256"),
      rawBody,
    )
  ) {
    return NextResponse.json({ error: "Bad signature" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entries =
    (payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })
      .entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      for (const status of (value.statuses as StatusEvent[] | undefined) ?? []) {
        if (!status.id) continue;
        const data: Record<string, unknown> = {};
        if (status.status === "delivered") {
          data.status = "DELIVERED";
          data.deliveredAt = new Date();
        } else if (status.status === "read") {
          data.status = "READ";
        } else if (status.status === "failed") {
          data.status = "FAILED";
          data.error = status.errors?.[0]?.title ?? "Delivery failed";
        } else {
          continue;
        }
        await db.message.updateMany({
          where: { providerMessageId: status.id },
          data,
        });
      }

      for (const inbound of (value.messages as InboundMessage[] | undefined) ?? []) {
        if (!inbound.from) continue;
        const phone = inbound.from.replace(/\D/g, "").slice(-10);
        const party = await db.party.findFirst({ where: { phone } });
        if (!party) continue;

        const text = inbound.text?.body?.trim() ?? `[${inbound.type ?? "media"}]`;

        await db.message.create({
          data: {
            partyId: party.id,
            channel: "WHATSAPP",
            direction: "INBOUND",
            status: "RECEIVED",
            body: text,
            providerMessageId: inbound.id ?? null,
          },
        });

        if (OPT_OUT_WORDS.has(text.toLowerCase())) {
          await db.party.update({
            where: { id: party.id },
            data: { consentStatus: "OPTED_OUT", consentUpdatedAt: new Date() },
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
