const IST_OFFSET_MS = 330 * 60 * 1000;

export function istMonthKey(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1));
}

export function istMonthWindow(monthKey: Date): { start: Date; end: Date } {
  const y = monthKey.getUTCFullYear();
  const m = monthKey.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS),
  };
}

export function monthProgress(now: Date): number {
  const { start, end } = istMonthWindow(istMonthKey(now));
  const frac = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
  return Math.min(Math.max(frac, 0), 1);
}

export type PaceResult = {
  actualPct: number;
  expectedPct: number;
  projectedTotal: number;
  onTrack: boolean;
};

const PACE_TOLERANCE = 0.05;

export function pace(target: number, collected: number, now: Date): PaceResult {
  const expectedPct = monthProgress(now);
  const actualPct = target > 0 ? collected / target : 0;
  const projectedTotal = expectedPct > 0 ? collected / expectedPct : collected;
  const onTrack = target <= 0 || actualPct >= expectedPct - PACE_TOLERANCE;
  return { actualPct, expectedPct, projectedTotal, onTrack };
}
