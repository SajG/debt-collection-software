import { describe, expect, it } from "vitest";
import { istMonthKey, istMonthWindow, monthProgress, pace } from "../targets";

const JULY_KEY = new Date(Date.UTC(2026, 6, 1));

describe("istMonthKey", () => {
  it("uses the IST month, not the UTC month, near midnight", () => {
    expect(istMonthKey(new Date(Date.UTC(2026, 5, 30, 20, 0)))).toEqual(JULY_KEY);
    expect(istMonthKey(new Date(Date.UTC(2026, 5, 30, 17, 0)))).toEqual(
      new Date(Date.UTC(2026, 5, 1))
    );
  });
});

describe("istMonthWindow", () => {
  it("returns UTC instants of IST month boundaries", () => {
    const { start, end } = istMonthWindow(JULY_KEY);
    expect(start.toISOString()).toBe("2026-06-30T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });
});

describe("monthProgress", () => {
  it("is ~0 at month start and ~1 at month end", () => {
    expect(monthProgress(new Date("2026-06-30T18:30:00.000Z"))).toBeCloseTo(0, 5);
    expect(monthProgress(new Date("2026-07-31T18:29:00.000Z"))).toBeCloseTo(1, 2);
  });
});

describe("pace", () => {
  const midJuly = new Date("2026-07-16T06:30:00.000Z");

  it("reports on-track when collection matches elapsed time", () => {
    const r = pace(100_000, 50_000, midJuly);
    expect(r.actualPct).toBeCloseTo(0.5, 2);
    expect(r.expectedPct).toBeCloseTo(0.5, 2);
    expect(r.onTrack).toBe(true);
    expect(r.projectedTotal).toBeCloseTo(100_000, -2);
  });

  it("reports behind when collection lags badly", () => {
    const r = pace(100_000, 10_000, midJuly);
    expect(r.onTrack).toBe(false);
  });

  it("handles a zero target without dividing by zero", () => {
    const r = pace(0, 5_000, midJuly);
    expect(r.actualPct).toBe(0);
    expect(r.onTrack).toBe(true);
  });
});
