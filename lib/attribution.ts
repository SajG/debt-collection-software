// SY42 — first-touch attribution. A short-lived cookie records where a
// visitor came from the first time they hit a marketing page; the
// sign-up action copies it onto the SignupLead.
//
// Pure helpers only: middleware (edge) and server actions both import
// this, so no Node or Next APIs here.

export const ATTRIBUTION_COOKIE = "syncit_attr";
export const ATTRIBUTION_MAX_AGE_S = 60 * 60 * 24 * 90;

export type Attribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
  landingPath?: string;
  referralCode?: string;
  firstSeenAt?: string;
};

const MAX = 200;
const clip = (v: string | null | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t.slice(0, MAX) : undefined;
};

/** Build attribution from a landing URL + Referer. Returns null when
 *  there is nothing worth storing (internal navigation, no params). */
export function attributionFromRequest(input: {
  url: URL;
  referer: string | null;
  now?: Date;
}): Attribution | null {
  const { url, referer } = input;
  const q = url.searchParams;
  let externalReferrer: string | undefined;
  if (referer) {
    try {
      const r = new URL(referer);
      if (r.host !== url.host) externalReferrer = clip(r.host + r.pathname);
    } catch {
      /* ignore malformed referer */
    }
  }
  const a: Attribution = {
    utmSource: clip(q.get("utm_source")),
    utmMedium: clip(q.get("utm_medium")),
    utmCampaign: clip(q.get("utm_campaign")),
    utmTerm: clip(q.get("utm_term")),
    utmContent: clip(q.get("utm_content")),
    gclid: clip(q.get("gclid")),
    fbclid: clip(q.get("fbclid")),
    referrer: externalReferrer,
  };
  const hasSignal = Object.values(a).some(Boolean);
  const refMatch = /^\/r\/([A-Za-z0-9_-]{1,16})$/.exec(url.pathname);
  if (refMatch) a.referralCode = refMatch[1];
  if (!hasSignal && !a.referralCode) return null;
  a.landingPath = clip(url.pathname);
  a.firstSeenAt = (input.now ?? new Date()).toISOString();
  return a;
}

export function serializeAttribution(a: Attribution): string {
  return encodeURIComponent(JSON.stringify(a));
}

export function parseAttribution(raw: string | undefined | null): Attribution {
  if (!raw) return {};
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const out: Attribution = {};
    for (const k of [
      "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent",
      "gclid", "fbclid", "referrer", "landingPath", "referralCode", "firstSeenAt",
    ] as const) {
      const v = o[k];
      if (typeof v === "string") out[k] = v.slice(0, MAX);
    }
    return out;
  } catch {
    return {};
  }
}
