// Supabase Edge Function: notify
//
// Invoked by Postgres triggers (see prisma migration
// 20260819210001_notification_triggers) via pg_net.http_post. Reads
// the shared secret from the request header, resolves recipients +
// per-user prefs, and sends via Expo's push service. Stale tokens
// (Expo returns DeviceNotRegistered) are deleted so the table doesn't
// grow forever.
//
// Deploy with:
//   supabase functions deploy notify --no-verify-jwt
//   supabase secrets set NOTIFY_SHARED_SECRET=<random-32-byte-hex>
// then in the DB (once):
//   UPDATE "NotificationConfig" SET
//     "edgeFunctionUrl" = 'https://<project>.supabase.co/functions/v1/notify',
//     "edgeFunctionSecret" = '<same random hex>'
//   WHERE id = 'singleton';

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type EventPayload =
  | {
      event: "status_change";
      salesOrderId: string;
      orderNumber: string;
      status: OrderStatus;
      salespersonId: string;
    }
  | {
      event: "document_upload";
      salesOrderId: string;
      orderNumber: string;
      documentType: "INVOICE" | "LORRY_RECEIPT" | "ORDER_PROOF" | "OTHER";
      salespersonId: string;
    }
  | {
      event: "credit_issue";
      salesOrderId: string;
      orderNumber: string;
    }
  | {
      event: "stale_order";
      salesOrderId: string;
      orderNumber: string;
      hoursOld: number;
    };

type OrderStatus =
  | "ORDER_PLACED"
  | "IN_PRODUCTION"
  | "READY_TO_DISPATCH"
  | "LR_GENERATED"
  | "DISPATCHED"
  | "CANCELLED";

const STATUS_LABEL: Record<OrderStatus, string> = {
  ORDER_PLACED: "Order placed",
  IN_PRODUCTION: "In production",
  READY_TO_DISPATCH: "Ready to dispatch",
  LR_GENERATED: "LR generated",
  DISPATCHED: "Dispatched",
  CANCELLED: "Cancelled",
};

const DOC_LABEL: Record<string, string> = {
  INVOICE: "Invoice",
  LORRY_RECEIPT: "Lorry receipt",
  ORDER_PROOF: "Order proof",
  OTHER: "Document",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Service role client — bypasses RLS so we can read tokens across
// users and delete stale ones. Never expose this key to the client.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const secret = Deno.env.get("NOTIFY_SHARED_SECRET") ?? "";
  const provided = req.headers.get("x-notify-secret") ?? "";
  if (!secret || provided !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  let body: EventPayload;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  try {
    const messages = await buildMessages(body);
    if (messages.length === 0) {
      return json({ ok: true, sent: 0 });
    }
    const receipts = await sendToExpo(messages);
    await cleanupStaleTokens(receipts, messages);
    return json({ ok: true, sent: messages.length });
  } catch (e) {
    console.error("notify handler failed", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});

async function buildMessages(payload: EventPayload): Promise<ExpoMessage[]> {
  const title = titleFor(payload);
  const bodyText = bodyFor(payload);
  const data = {
    // Both fields let the mobile app deep-link cleanly.
    url: deepLinkFor(payload),
    event: payload.event,
    salesOrderId:
      "salesOrderId" in payload ? payload.salesOrderId : undefined,
  };

  const recipients = await recipientsFor(payload);
  if (recipients.length === 0) return [];

  const { data: tokens, error } = await supabase
    .from("PushToken")
    .select("token, profileId, platform")
    .in("profileId", recipients);
  if (error) throw error;

  return (tokens ?? []).map((t) => ({
    to: t.token,
    title,
    body: bodyText,
    data,
    sound: "default",
    priority: "high",
    channelId: "default",
  }));
}

async function recipientsFor(payload: EventPayload): Promise<string[]> {
  const prefColumn = prefColumnFor(payload.event);

  if (payload.event === "status_change" || payload.event === "document_upload") {
    // Direct recipient: the order's salesperson. Filter on their pref.
    const { data, error } = await supabase
      .from("Profile")
      .select("id")
      .eq("id", (payload as any).salespersonId)
      .eq(prefColumn, true)
      .maybeSingle();
    if (error) throw error;
    return data ? [data.id] : [];
  }

  // credit_issue / stale_order: all ADMINs opted in.
  const { data, error } = await supabase
    .from("Profile")
    .select("id")
    .eq("role", "ADMIN")
    .eq(prefColumn, true);
  if (error) throw error;
  return (data ?? []).map((p) => p.id);
}

function prefColumnFor(event: EventPayload["event"]): string {
  switch (event) {
    case "status_change":
      return "notifyStatusChanges";
    case "document_upload":
      return "notifyDocuments";
    case "stale_order":
      return "notifyStaleOrders";
    case "credit_issue":
      return "notifyCreditIssues";
  }
}

function titleFor(p: EventPayload): string {
  switch (p.event) {
    case "status_change":
      return `${p.orderNumber} · ${STATUS_LABEL[p.status] ?? p.status}`;
    case "document_upload":
      return `${DOC_LABEL[p.documentType] ?? "Document"} uploaded`;
    case "credit_issue":
      return `Credit check failed`;
    case "stale_order":
      return `Order still not started`;
  }
}

function bodyFor(p: EventPayload): string {
  switch (p.event) {
    case "status_change":
      return `Your order ${p.orderNumber} is now ${STATUS_LABEL[p.status] ?? p.status}.`;
    case "document_upload":
      return `${DOC_LABEL[p.documentType]} uploaded for ${p.orderNumber}.`;
    case "credit_issue":
      return `${p.orderNumber} was placed but did not pass the credit check.`;
    case "stale_order":
      return `${p.orderNumber} has been sitting in Order Placed for ${p.hoursOld}h.`;
  }
}

function deepLinkFor(p: EventPayload): string {
  const id =
    "salesOrderId" in p ? p.salesOrderId : "";
  // The mobile app registers `paytrack://` (or the Expo scheme in dev).
  // Deep-link into the factory route for factory users, staff route for
  // everyone else — routing on the mobile side is idempotent.
  return `paytrack://orders/${id}`;
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | {
      status: "error";
      message: string;
      details?: { error?: string };
    };

async function sendToExpo(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  // Expo push service accepts batches up to 100.
  const tickets: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
    });
    if (!resp.ok) {
      console.error("expo push HTTP error", resp.status, await resp.text());
      // Push a synthetic error ticket per message so cleanup pass has
      // something to iterate over and the caller sees the failure.
      for (let j = 0; j < batch.length; j++) {
        tickets.push({ status: "error", message: `HTTP ${resp.status}` });
      }
      continue;
    }
    const parsed = (await resp.json()) as { data: ExpoTicket[] };
    tickets.push(...(parsed.data ?? []));
  }
  return tickets;
}

async function cleanupStaleTokens(
  tickets: ExpoTicket[],
  messages: ExpoMessage[],
) {
  const doomed: string[] = [];
  tickets.forEach((t, i) => {
    if (t.status === "error" && t.details?.error === "DeviceNotRegistered") {
      doomed.push(messages[i].to);
    }
  });
  if (doomed.length === 0) return;
  const { error } = await supabase
    .from("PushToken")
    .delete()
    .in("token", doomed);
  if (error) console.error("stale token cleanup failed", error);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
