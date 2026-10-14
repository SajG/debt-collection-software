import Link from "next/link";
import { getHealth, type CheckName } from "@/lib/platform/health";

// SY40 — public service status. Shows the same three checks as
// /api/health (it calls the same function), so what a customer sees
// here is what the uptime monitor sees. /status/<token> next to this
// file is unrelated: that is a customer's signed order-status link.

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Service status — Syncit",
  description: "Whether Syncit sign-in, data and email are working right now.",
  robots: { index: false, follow: false },
};

const LABELS: Record<CheckName, { name: string; what: string }> = {
  database: { name: "Orders, customers and payments", what: "Opening and saving your data" },
  auth: { name: "Sign-in", what: "Sign-in codes and sessions" },
  email: { name: "Email", what: "Sign-in codes, reminders and summaries by email" },
};

const HEADLINE = {
  ok: "Everything is working",
  degraded: "Syncit is working, but email is delayed",
  down: "Syncit is having a problem",
} as const;

export default async function StatusPage() {
  const health = await getHealth();
  const checkedAt = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(health.checkedAt));
  const externalUrl = process.env.NEXT_PUBLIC_STATUS_HISTORY_URL;

  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-syncit-bond">Syncit status</p>
      <h1 className="mt-2 text-3xl font-bold text-syncit-ink">{HEADLINE[health.status]}</h1>
      <p className="mt-2 text-base text-syncit-inkMuted">Checked {checkedAt} IST. Refresh the page to check again.</p>

      <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-white">
        {(Object.keys(LABELS) as CheckName[]).map((key) => {
          const check = health.checks[key];
          return (
            <li key={key} className="flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="text-base font-semibold text-syncit-ink">{LABELS[key].name}</p>
                <p className="text-sm text-syncit-inkMuted">{LABELS[key].what}</p>
              </div>
              <span
                className={
                  check.ok
                    ? "rounded-full bg-syncit-bond px-3 py-1 text-sm font-semibold text-white"
                    : "rounded-full bg-syncit-fault px-3 py-1 text-sm font-semibold text-white"
                }
              >
                {check.ok ? "Working" : "Not working"}
              </span>
            </li>
          );
        })}
      </ul>

      {health.status !== "ok" ? (
        <p className="mt-6 text-base text-syncit-ink">
          We have been alerted and are working on it. Orders saved in the mobile app while offline are kept on the
          phone and sent when service returns.
        </p>
      ) : null}

      <p className="mt-8 text-sm text-syncit-inkMuted">
        {externalUrl ? (
          <>
            <a href={externalUrl} className="underline underline-offset-4" rel="noopener noreferrer">
              Uptime history
            </a>
            {" · "}
          </>
        ) : null}
        <Link href="/help/contact-support" className="underline underline-offset-4">
          Contact support
        </Link>
      </p>
    </main>
  );
}
