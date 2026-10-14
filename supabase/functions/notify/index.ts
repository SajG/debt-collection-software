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
      rejectionReason?: string | null;
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
    }
  | {
      event: "comment_added";
      salesOrderId: string;
      orderNumber: string;
      salespersonId: string;
      authorId: string;
      preview: string;
    };

// SY29 — the 9:00 "Today: 6 customers, ₹3.4L to follow up" push. Sent
// by the web cron /api/cron/daily-followups, once per company, with the
// text already worked out per salesperson. Handled separately from the
// order events above (handleDailyFollowups).
type DailyFollowupsPayload = {
  event: "daily_followups";
  organizationId: string;
  recipients: { profileId: string; title: string; body: string }[];
};

// SY40 — "an order has waited 30 minutes for approval". Sent by the web
// cron /api/cron/notify-pending-approval. Until SY40 that cron posted a
// shape this function did not know, with the wrong auth header, so the
// nudge was refused every time. Handled by handlePendingApproval.
type PendingApprovalPayload = {
  event: "pending_approval";
  organizationId: string;
  salesOrderId: string;
  orderNumber: string | number;
  waitedMinutes: number;
  adminProfileIds: string[];
};

type OrderStatus =
  | "PENDING_APPROVAL"
  | "ORDER_PLACED"
  | "IN_PRODUCTION"
  | "ON_HOLD"
  | "READY_TO_DISPATCH"
  | "LR_GENERATED"
  | "PARTIALLY_DISPATCHED"
  | "DISPATCHED"
  | "DELIVERED"
  | "REJECTED"
  | "CANCELLED";

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_APPROVAL: "Awaiting approval",
  ORDER_PLACED: "Order placed",
  IN_PRODUCTION: "In production",
  ON_HOLD: "On hold",
  READY_TO_DISPATCH: "Ready to dispatch",
  LR_GENERATED: "LR generated",
  PARTIALLY_DISPATCHED: "Partially dispatched",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
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

  if ((body as unknown as { event?: string }).event === "daily_followups") {
    try {
      const sent = await handleDailyFollowups(body as unknown as DailyFollowupsPayload);
      return json({ ok: true, sent });
    } catch (e) {
      console.error("daily_followups failed", e);
      return json({ ok: false, error: String(e) }, 500);
    }
  }

  if ((body as unknown as { event?: string }).event === "pending_approval") {
    try {
      const sent = await handlePendingApproval(body as unknown as PendingApprovalPayload);
      return json({ ok: true, sent });
    } catch (e) {
      console.error("pending_approval failed", e);
      return json({ ok: false, error: String(e) }, 500);
    }
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

// Returns how many pushes were handed to Expo. A recipient is dropped
// unless they are an ACTIVE member of the named company, their account
// is active, and they have left "Daily follow-up summary" switched on —
// so a stale or wrong list from the caller cannot reach another
// company's people.
async function handleDailyFollowups(p: DailyFollowupsPayload): Promise<number> {
  const wanted = (p.recipients ?? []).slice(0, 1000);
  const ids = wanted.map((r) => r.profileId);
  if (!p.organizationId || ids.length === 0) return 0;

  const { data: members, error: mErr } = await supabase
    .from("Membership")
    .select("profileId")
    .eq("organizationId", p.organizationId)
    .eq("isActive", true)
    .in("profileId", ids);
  if (mErr) throw mErr;
  const { data: opted, error: pErr } = await supabase
    .from("Profile")
    .select("id")
    .eq("isActive", true)
    .eq("notifyDailyPlan", true)
    .in("id", ids);
  if (pErr) throw pErr;

  const memberIds = new Set((members ?? []).map((m) => m.profileId));
  const allowed = new Set((opted ?? []).map((o) => o.id).filter((id) => memberIds.has(id)));
  if (allowed.size === 0) return 0;

  const { data: tokens, error: tErr } = await supabase
    .from("PushToken")
    .select("token, profileId")
    .in("profileId", Array.from(allowed));
  if (tErr) throw tErr;

  const textFor = new Map(wanted.map((r) => [r.profileId, r]));
  const messages: ExpoMessage[] = (tokens ?? []).map((t) => {
    const r = textFor.get(t.profileId)!;
    return {
      to: t.token,
      title: String(r.title).slice(0, 80),
      body: String(r.body).slice(0, 200),
      data: { event: "daily_followups", url: "syncit://" },
      sound: "default",
      priority: "high",
      channelId: "default",
    };
  });
  if (messages.length === 0) return 0;
  const receipts = await sendToExpo(messages);
  await cleanupStaleTokens(receipts, messages);
  return messages.length;
}

// Only people who are ACTIVE Management (ADMIN) members of the named
// company and whose account is active are notified — whatever list the
// caller sent. The order must belong to that company too.
async function handlePendingApproval(p: PendingApprovalPayload): Promise<number> {
  const ids = (p.adminProfileIds ?? []).slice(0, 200);
  if (!p.organizationId || !p.salesOrderId || ids.length === 0) return 0;

  const { data: order, error: oErr } = await supabase
    .from("SalesOrder")
    .select("id")
    .eq("id", p.salesOrderId)
    .eq("organizationId", p.organizationId)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order) return 0;

  const { data: members, error: mErr } = await supabase
    .from("Membership")
    .select("profileId")
    .eq("organizationId", p.organizationId)
    .eq("role", "ADMIN")
    .eq("isActive", true)
    .in("profileId", ids);
  if (mErr) throw mErr;
  const memberIds = (members ?? []).map((m) => m.profileId);
  if (memberIds.length === 0) return 0;

  const { data: active, error: pErr } = await supabase
    .from("Profile")
    .select("id")
    .eq("isActive", true)
    .in("id", memberIds);
  if (pErr) throw pErr;
  const allowed = (active ?? []).map((a) => a.id);
  if (allowed.length === 0) return 0;

  const { data: tokens, error: tErr } = await supabase
    .from("PushToken")
    .select("token, profileId")
    .in("profileId", allowed);
  if (tErr) throw tErr;

  const minutes = Math.max(1, Math.round(Number(p.waitedMinutes) || 0));
  const messages: ExpoMessage[] = (tokens ?? []).map((t) => ({
    to: t.token,
    title: "Order waiting for approval",
    body: `Order ${String(p.orderNumber).slice(0, 40)} has waited ${minutes} min.`,
    data: { event: "pending_approval", salesOrderId: p.salesOrderId, url: "syncit://" },
    sound: "default",
    priority: "high",
    channelId: "default",
  }));
  if (messages.length === 0) return 0;
  const receipts = await sendToExpo(messages);
  await cleanupStaleTokens(receipts, messages);
  return messages.length;
}

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

  if (payload.event === "comment_added") {
    // Counterparty routing:
    //   author is the salesperson (STAFF)   → notify FACTORY + ADMIN
    //   author is anyone else               → notify the salesperson
    // Everyone respects their own notifyComments pref.
    if (payload.authorId === payload.salespersonId) {
      const { data, error } = await supabase
        .from("Profile")
        .select("id")
        .in("role", ["FACTORY", "ADMIN"])
        .eq(prefColumn, true);
      if (error) throw error;
      return (data ?? []).map((p) => p.id);
    }
    const { data, error } = await supabase
      .from("Profile")
      .select("id")
      .eq("id", payload.salespersonId)
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
    case "comment_added":
      return "notifyComments";
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
    case "comment_added":
      return `New comment on ${p.orderNumber}`;
  }
}

function bodyFor(p: EventPayload): string {
  switch (p.event) {
    case "status_change":
      if (p.status === "REJECTED") {
        const reason = p.rejectionReason?.trim();
        return reason
          ? `Your order ${p.orderNumber} was rejected: ${reason}`
          : `Your order ${p.orderNumber} was rejected.`;
      }
      return `Your order ${p.orderNumber} is now ${STATUS_LABEL[p.status] ?? p.status}.`;
    case "document_upload":
      return `${DOC_LABEL[p.documentType]} uploaded for ${p.orderNumber}.`;
    case "credit_issue":
      return `${p.orderNumber} was placed but did not pass the credit check.`;
    case "stale_order":
      return `${p.orderNumber} has been sitting in Order Placed for ${p.hoursOld}h.`;
    case "comment_added":
      return p.preview.length >= 140 ? `${p.preview}…` : p.preview;
  }
}

function deepLinkFor(p: EventPayload): string {
  const id =
    "salesOrderId" in p ? p.salesOrderId : "";
  // The mobile app registers `syncit://` (or the Expo scheme in dev).
  // Deep-link into the factory route for factory users, staff route for
  // everyone else — routing on the mobile side is idempotent.
  return `syncit://orders/${id}`;
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
