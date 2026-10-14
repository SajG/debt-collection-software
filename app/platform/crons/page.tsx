import { requirePlatformAdmin } from "@/lib/platform/admin";
import { cronOverview, recentCronRuns } from "@/lib/platform/cron-run";
import { getHealth } from "@/lib/platform/health";

// SY40 — /platform/crons. One row per scheduled job (last run, late or
// not, failures this week) and the latest 100 runs. Counts only.

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function seconds(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "OK"
      ? "bg-syncit-bond text-white"
      : status === "PARTIAL"
        ? "bg-syncit-curBg text-syncit-ink"
        : "bg-syncit-fault text-white";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
}

export default async function PlatformCronsPage() {
  await requirePlatformAdmin();
  const [jobs, runs, health] = await Promise.all([cronOverview(), recentCronRuns(100), getHealth()]);
  const late = jobs.filter((j) => j.late);

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-foreground">Scheduled jobs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Times in IST. Service health right now: <strong className="text-foreground">{health.status}</strong>.
        {late.length > 0
          ? ` ${late.length} job${late.length === 1 ? " has" : "s have"} not run when expected.`
          : " Every job has run on schedule."}
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Schedule</th>
              <th className="px-3 py-2 font-medium">Last run</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2 font-medium">Companies</th>
              <th className="px-3 py-2 font-medium">Took</th>
              <th className="px-3 py-2 font-medium">7 days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobs.map((j) => (
              <tr key={j.job}>
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{j.label}</div>
                  <div className="font-mono text-xs text-muted-foreground">{j.job}</div>
                </td>
                <td className="px-3 py-2 text-foreground">{j.schedule}</td>
                <td className="px-3 py-2 text-foreground">
                  {j.last ? fmt.format(j.last.startedAt) : "Never"}
                  {j.late ? (
                    <span className="ml-2 rounded-full bg-syncit-fault px-2 py-0.5 text-xs font-semibold text-white">
                      Late
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{j.last ? <StatusPill status={j.last.status} /> : "—"}</td>
                <td className="px-3 py-2 text-foreground">
                  {j.last ? `${j.last.orgCount}${j.last.failures ? ` (${j.last.failures} failed)` : ""}` : "—"}
                </td>
                <td className="px-3 py-2 text-foreground">{j.last ? seconds(j.last.durationMs) : "—"}</td>
                <td className="px-3 py-2 text-foreground">
                  {j.runsLast7Days} runs{j.failedLast7Days ? `, ${j.failedLast7Days} not OK` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-foreground">Latest runs</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2 font-medium">Companies</th>
              <th className="px-3 py-2 font-medium">Failures</th>
              <th className="px-3 py-2 font-medium">Took</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No runs recorded yet.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-foreground">{fmt.format(r.startedAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-foreground">{r.job}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-foreground">{r.orgCount}</td>
                  <td className="px-3 py-2 text-foreground">{r.failures}</td>
                  <td className="px-3 py-2 text-foreground">{seconds(r.durationMs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
