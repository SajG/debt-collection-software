// Sentry server SDK for Next.js server runtime. Same PII-scrub
// posture as the client config — headers/cookies/body always
// stripped before send.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
      }
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        if (event.request.data) event.request.data = "[scrubbed]";
        if (event.request.query_string)
          event.request.query_string = "[scrubbed]";
      }
      return event;
    },
  });
}
