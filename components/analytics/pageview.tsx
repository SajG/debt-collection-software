"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { mkt } from "@/components/marketing/tokens";

// SY38 — marketing-site page views + the consent bar.
//
// Until the visitor says yes, nothing is stored in the browser: each
// page view carries a throw-away random id. "Accept" stores the choice
// and one random id in localStorage; "No thanks" stores only the
// choice. No cookie is ever set by this component. Events go to our
// own /api/t, which forwards to PostHog (see that route).

const CHOICE_KEY = "syncit_analytics";
const ID_KEY = "syncit_visitor";

type Choice = "yes" | "no" | null;

function readChoice(): Choice {
  try {
    const v = window.localStorage.getItem(CHOICE_KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

function visitorId(consented: boolean): string {
  if (!consented) return crypto.randomUUID();
  try {
    let id = window.localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function send(path: string, consented: boolean) {
  let referrerHost = "";
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.host !== window.location.host) referrerHost = r.host;
  } catch {
    /* ignore */
  }
  const body = JSON.stringify({ path, referrerHost, id: visitorId(consented), consented });
  // keepalive lets the request finish if the visitor navigates away.
  void fetch("/api/t", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function MarketingAnalytics({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const [choice, setChoice] = useState<Choice | "unknown">("unknown");

  useEffect(() => {
    setChoice(readChoice());
  }, []);

  useEffect(() => {
    if (!enabled || choice === "unknown" || !pathname) return;
    // Idle time, so the beacon never competes with first paint.
    const run = () => send(pathname, choice === "yes");
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (ric) ric(run);
    else setTimeout(run, 1200);
  }, [enabled, pathname, choice]);

  if (!enabled || choice !== null) return null;

  const decide = (value: "yes" | "no") => {
    try {
      window.localStorage.setItem(CHOICE_KEY, value);
      if (value === "no") window.localStorage.removeItem(ID_KEY);
    } catch {
      /* private mode — the choice simply isn't remembered */
    }
    setChoice(value);
  };

  return (
    <div
      role="region"
      aria-label="Analytics choice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border bg-white p-4 shadow-lg sm:inset-x-auto sm:right-4"
      style={{ borderColor: mkt.border, color: mkt.ink }}
    >
      <p className="text-sm leading-relaxed">
        We count page visits to see which pages help. No ads, no selling data. May we remember
        this browser between visits?{" "}
        <a href="/privacy" className="underline">
          Privacy
        </a>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => decide("yes")}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: mkt.teal }}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => decide("no")}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: mkt.border }}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
