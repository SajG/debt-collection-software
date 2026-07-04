import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Meta webhook verification handshake (configure the same token in the
// Meta app dashboard and WHATSAPP_WEBHOOK_VERIFY_TOKEN).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
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
  let payload: unknown;
  try {
    payload = await request.json();
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
