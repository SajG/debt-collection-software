import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { captureError } from "@/lib/monitoring";

// SY40 — every scheduled pass leaves a CronRun row: when, how long, how
// many companies, how many failures. /platform/crons reads them, and a
// job that has gone quiet shows up there as "late".
//
// Usage, in app/api/cron/<job>/route.ts:
//
//   export const GET = withCronRun("reminders", handle);
//
// The handler keeps doing its own CRON_SECRET check and returns its
// usual JSON summary; this wrapper only times it and reads the counts.
// Nothing is recorded for a 401/400 (not a run) or a preview / dry run.
// Writing the row can never fail the cron itself.

export type CronStatus = "OK" | "PARTIAL" | "FAILED";

/** Schedule facts for the console. `everyMinutes` is the longest gap
 *  expected between two runs; Monday-only and Mon–Sat jobs use the
 *  longest gap in their week. Keep in step with vercel.json. */
export const CRON_JOBS: Record<string, { label: string; schedule: string; everyMinutes: number }> = {
  "reminders": { label: "Payment reminders", schedule: "Daily 10:30 IST", everyMinutes: 1440 },
  "reconcile-orders": { label: "Order reconciliation", schedule: "Daily 09:00 IST", everyMinutes: 1440 },
  "recovery": { label: "Overdue review", schedule: "Daily 11:00 IST", everyMinutes: 1440 },
  "notify-pending-approval": { label: "Pending-approval nudge", schedule: "Every 10 minutes", everyMinutes: 10 },
  "trial-reminders": { label: "Trial and billing locks", schedule: "Daily 09:30 IST", everyMinutes: 1440 },
  "company-deletion": { label: "Company deletion", schedule: "Daily 10:00 IST", everyMinutes: 1440 },
  "daily-followups": { label: "Daily follow-up push", schedule: "Mon–Sat 09:00 IST", everyMinutes: 2880 },
  "weekly-summary": { label: "Weekly summary email", schedule: "Monday 09:00 IST", everyMinutes: 10080 },
  "lifecycle": { label: "Lifecycle emails", schedule: "Daily 09:45 IST", everyMinutes: 1440 },
};

const ORG_KEYS = ["orgsProcessed", "orgs", "organizations"];
const FAILURE_KEYS = ["orgsFailed", "errors", "failed", "failures"];

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (Array.isArray(v)) return v.length;
  return 0;
}

/** Pull the counts out of a cron's JSON summary. Also adds up
 *  `errors` / `failed` inside `perOrg`, so a pass where every company
 *  "succeeded" with send errors is still reported as PARTIAL. */
export function summariseCronBody(body: unknown): {
  orgCount: number;
  failures: number;
  detail: Record<string, number>;
} {
  const detail: Record<string, number> = {};
  if (!body || typeof body !== "object") return { orgCount: 0, failures: 0, detail };
  const o = body as Record<string, unknown>;
  let orgCount = 0;
  let failures = 0;
  for (const k of ORG_KEYS) if (k in o) orgCount = Math.max(orgCount, num(o[k]));
  for (const k of FAILURE_KEYS) if (k in o) failures += num(o[k]);
  if (Array.isArray(o.perOrg)) {
    for (const row of o.perOrg) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      for (const k of FAILURE_KEYS) if (k in r) failures += num(r[k]);
    }
  }
  if ("orgsFailed" in o) orgCount += num(o.orgsFailed);
  // Keep top-level numeric counters only: no nested rows, no strings.
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number" && Number.isFinite(v)) detail[k] = v;
  }
  return { orgCount, failures, detail };
}

export async function recordCronRun(input: {
  job: string;
  startedAt: Date;
  durationMs: number;
  status: CronStatus;
  orgCount: number;
  failures: number;
  detail: Record<string, number>;
}): Promise<void> {
  try {
    await db.cronRun.create({
      data: {
        job: input.job,
        startedAt: input.startedAt,
        durationMs: input.durationMs,
        status: input.status,
        orgCount: input.orgCount,
        failures: input.failures,
        detail: Object.keys(input.detail).length ? (input.detail as Prisma.InputJsonObject) : Prisma.JsonNull,
      },
    });
  } catch (e) {
    await captureError(e, { scope: "cron-run.record", job: input.job });
  }
}

type Handler = (request: NextRequest) => Promise<Response>;

export function withCronRun(job: string, handler: Handler): Handler {
  return async (request) => {
    const startedAt = new Date();
    const params = request.nextUrl.searchParams;
    const rehearsal = params.has("preview") || params.has("dryRun");

    let response: Response;
    try {
      response = await handler(request);
    } catch (e) {
      await captureError(e, { scope: `cron.${job}` });
      await recordCronRun({
        job,
        startedAt,
        durationMs: Date.now() - startedAt.getTime(),
        status: "FAILED",
        orgCount: 0,
        failures: 1,
        detail: {},
      });
      return Response.json({ error: "Cron pass failed" }, { status: 500 });
    }

    // 401 / 400 are refused calls, not runs.
    if (rehearsal || (response.status >= 400 && response.status < 500)) return response;

    const durationMs = Date.now() - startedAt.getTime();
    if (response.status >= 500) {
      await recordCronRun({ job, startedAt, durationMs, status: "FAILED", orgCount: 0, failures: 1, detail: {} });
      return response;
    }
    const body = await response.clone().json().catch(() => null);
    const { orgCount, failures, detail } = summariseCronBody(body);
    await recordCronRun({
      job,
      startedAt,
      durationMs,
      status: failures > 0 ? "PARTIAL" : "OK",
      orgCount,
      failures,
      detail,
    });
    return response;
  };
}

export type CronJobHealth = {
  job: string;
  label: string;
  schedule: string;
  last: { startedAt: Date; durationMs: number; status: string; orgCount: number; failures: number } | null;
  /** No run within the expected gap plus a margin. */
  late: boolean;
  failedLast7Days: number;
  runsLast7Days: number;
};

/** A job is late when its last run is older than its schedule gap plus
 *  half a gap (at least 20 minutes) of slack. */
export function isLate(lastStartedAt: Date | null, everyMinutes: number, now: Date): boolean {
  if (!lastStartedAt) return true;
  const slack = Math.max(20, everyMinutes / 2);
  return now.getTime() - lastStartedAt.getTime() > (everyMinutes + slack) * 60_000;
}

export async function cronOverview(now = new Date()): Promise<CronJobHealth[]> {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const out: CronJobHealth[] = [];
  for (const [job, meta] of Object.entries(CRON_JOBS)) {
    const [last, runs, failed] = await Promise.all([
      db.cronRun.findFirst({
        where: { job },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, durationMs: true, status: true, orgCount: true, failures: true },
      }),
      db.cronRun.count({ where: { job, startedAt: { gte: weekAgo } } }),
      db.cronRun.count({ where: { job, startedAt: { gte: weekAgo }, status: { not: "OK" } } }),
    ]);
    out.push({
      job,
      label: meta.label,
      schedule: meta.schedule,
      last,
      late: isLate(last?.startedAt ?? null, meta.everyMinutes, now),
      runsLast7Days: runs,
      failedLast7Days: failed,
    });
  }
  return out;
}

export async function recentCronRuns(limit = 100) {
  return db.cronRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}

/** Keep 90 days. Called from the daily trial-reminders pass. */
export async function pruneCronRuns(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  const res = await db.cronRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
  return res.count;
}
