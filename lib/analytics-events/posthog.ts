// SY38 — product analytics (PostHog), server side.
//
// Events go straight to PostHog's capture endpoint with fetch: no SDK,
// nothing added to any browser bundle, and business events are recorded
// where they actually happen (server actions, webhooks, crons).
//
//   NEXT_PUBLIC_POSTHOG_KEY    project key; unset = every call is a no-op
//   NEXT_PUBLIC_POSTHOG_HOST   https://eu.i.posthog.com (default) or
//                              https://us.i.posthog.com
//
// Privacy rules, enforced here rather than left to call sites:
//   * a person is identified only by their Profile id (a uuid) and a
//     company only by its organizationId — never a name, email or phone;
//   * properties pass through an allow-list (sanitizeProperties): a
//     handful of keys, short code-like strings, booleans and small
//     counts. Customer names and money amounts cannot get through —
//     free text and large numbers are dropped.

export const PRODUCT_EVENTS = [
  "signup_completed",
  "company_created",
  "user_invited",
  "tally_connected",
  "first_order_placed",
  "first_payment_recorded",
  "reminder_sent",
  "plan_selected",
  "subscription_activated",
] as const;
export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

/** Property keys that may be sent, and nothing else. */
const ALLOWED_KEYS = new Set([
  "plan",
  "cycle",
  "role",
  "channel",
  "kind",
  "source",
  "automated",
  "referred",
  "change",
  "seats",
]);
const CODE_LIKE = /^[A-Za-z0-9_.:-]{1,40}$/;
const MAX_COUNT = 1000;

export function sanitizeProperties(
  props: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && CODE_LIKE.test(value)) out[key] = value;
    else if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT) {
      out[key] = value;
    }
  }
  return out;
}

export function posthogConfig(env: NodeJS.ProcessEnv = process.env): { key: string; host: string } | null {
  const key = (env.NEXT_PUBLIC_POSTHOG_KEY ?? "").trim();
  if (!key) return null;
  const host = (env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com").trim().replace(/\/+$/, "");
  return { key, host };
}

export type CaptureInput = {
  event: ProductEvent;
  /** Profile id of the person who did it; for automated work (cron,
   *  webhook) pass null and the company itself is the actor. */
  profileId: string | null;
  organizationId: string;
  properties?: Record<string, unknown>;
};

/** The JSON body PostHog receives. Exported for tests. */
export function buildCapturePayload(input: CaptureInput, key: string, now: Date = new Date()) {
  return {
    api_key: key,
    event: input.event,
    distinct_id: input.profileId ?? `org:${input.organizationId}`,
    timestamp: now.toISOString(),
    properties: {
      ...sanitizeProperties(input.properties),
      $groups: { organization: input.organizationId },
      // Server-side events carry no browser, IP or location.
      $geoip_disable: true,
      $lib: "syncit-server",
    },
  };
}

async function post(host: string, body: unknown): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record a product event. Never throws and never blocks for more than
 * ~2.5 s; analytics must not be able to fail a sign-up or a payment.
 * Await it — on serverless an un-awaited request is often cut off.
 */
export async function capture(input: CaptureInput): Promise<boolean> {
  const cfg = posthogConfig();
  if (!cfg) return false;
  return post(cfg.host, buildCapturePayload(input, cfg.key));
}

/** Attach non-identifying facts to the company group (plan only). */
export async function identifyOrganization(
  organizationId: string,
  props: { plan?: string; status?: string },
): Promise<boolean> {
  const cfg = posthogConfig();
  if (!cfg) return false;
  const set: Record<string, string> = {};
  if (props.plan && CODE_LIKE.test(props.plan)) set.plan = props.plan;
  if (props.status && CODE_LIKE.test(props.status)) set.status = props.status;
  return post(cfg.host, {
    api_key: cfg.key,
    event: "$groupidentify",
    distinct_id: `org:${organizationId}`,
    properties: {
      $group_type: "organization",
      $group_key: organizationId,
      $group_set: set,
      $geoip_disable: true,
    },
  });
}
