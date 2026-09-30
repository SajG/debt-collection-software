// Sentry browser SDK. Loaded on every client page. PII scrub in
// beforeSend — we deal with debt/collection data, so email/phone/
// note text getting into a third-party service is a privacy incident
// even if the DSN is ours.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.NODE_ENV ??
      "development",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubPii,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

function scrubPii(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.data) event.request.data = "[scrubbed]";
    if (event.request.query_string) event.request.query_string = "[scrubbed]";
  }
  return event;
}

function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.data) {
    for (const k of Object.keys(breadcrumb.data)) {
      if (/email|phone|token|password|otp|body/i.test(k)) {
        breadcrumb.data[k] = "[scrubbed]";
      }
    }
  }
  return breadcrumb;
}
