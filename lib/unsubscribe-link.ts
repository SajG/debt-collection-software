import { makeStatusToken, verifyStatusToken } from "@/lib/status-link";

// SY38 — unsubscribe link in lifecycle emails. Same signing as the
// order-status and statement links (lib/status-link.ts, unchanged),
// with its own subject prefix so the three kinds of token cannot be
// swapped: "unsub:<organizationId>". Valid for a year — an unsubscribe
// link in an old email should still work.

const PREFIX = "unsub:";

export function unsubscribeUrl(organizationId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/unsubscribe/${makeStatusToken(`${PREFIX}${organizationId}`, 365)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const v = verifyStatusToken(token);
  if (!v.ok || !v.orderId.startsWith(PREFIX)) return null;
  const id = v.orderId.slice(PREFIX.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
