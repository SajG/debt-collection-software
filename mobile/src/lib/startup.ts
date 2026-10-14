import { crumb } from "./observability";

// Cold-start timing: native process start → first real screen on
// glass. Budget is 2000 ms on a mid-range phone. The number is logged
// (`adb logcat | grep "\[startup\]"`) and sent as a Sentry breadcrumb
// so field devices report it too.

type RNPerformance = {
  now: () => number;
  rnStartupTiming?: { startTime?: number | null };
};

const perf = (globalThis as unknown as { performance?: RNPerformance }).performance;
// When the native start mark is unavailable (old architecture, web)
// fall back to "since this module loaded", which is JS-only time.
const jsStart = perf?.now() ?? Date.now();
let reported = false;

export const STARTUP_BUDGET_MS = 2000;

export function markFirstScreen(screen: string): void {
  if (reported) return;
  reported = true;
  const now = perf?.now() ?? Date.now();
  const nativeStart = perf?.rnStartupTiming?.startTime;
  const fromNative = typeof nativeStart === "number";
  const ms = Math.round(now - (fromNative ? (nativeStart as number) : jsStart));
  // i18n-ignore: log line
  const line = `[startup] ${fromNative ? "native start" : "js start"} → ${screen}: ${ms} ms (budget ${STARTUP_BUDGET_MS} ms)`;
  // eslint-disable-next-line no-console
  console.log(line);
  crumb("startup", line, { ms, screen, fromNative, overBudget: ms > STARTUP_BUDGET_MS });
}
