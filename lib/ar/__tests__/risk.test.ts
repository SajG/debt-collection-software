import { describe, expect, it } from "vitest";
import { levelForScore, riskScore, type RiskInput } from "../risk";

const base: RiskInput = {
  outstanding: 100_000,
  maxDaysOverdue: 0,
  creditLimit: null,
  brokenPromises: 0,
  latePaymentRatio: 0,
  hasOpenDispute: false,
};

describe("riskScore", () => {
  it("returns zero risk when nothing is outstanding", () => {
    const r = riskScore({ ...base, outstanding: 0, maxDaysOverdue: 90 });
    expect(r.score).toBe(0);
    expect(r.level).toBe("LOW");
  });

  it("increases monotonically with days overdue", () => {
    const at10 = riskScore({ ...base, maxDaysOverdue: 10 }).score;
    const at60 = riskScore({ ...base, maxDaysOverdue: 60 }).score;
    const at120 = riskScore({ ...base, maxDaysOverdue: 120 }).score;
    expect(at60).toBeGreaterThan(at10);
    expect(at120).toBeGreaterThan(at60);
  });

  it("caps the overdue component at 120 days", () => {
    const at120 = riskScore({ ...base, maxDaysOverdue: 120 }).score;
    const at400 = riskScore({ ...base, maxDaysOverdue: 400 }).score;
    expect(at400).toBe(at120);
  });

  it("weighs exposure against the credit limit when present", () => {
    const withinLimit = riskScore({
      ...base,
      outstanding: 50_000,
      creditLimit: 200_000,
    });
    const overLimit = riskScore({
      ...base,
      outstanding: 300_000,
      creditLimit: 200_000,
    });
    expect(overLimit.score).toBeGreaterThan(withinLimit.score);
    expect(overLimit.reasons).toContain(
      "Outstanding exceeds the agreed credit limit"
    );
  });

  it("penalises broken promises with a capped component", () => {
    const one = riskScore({ ...base, brokenPromises: 1 }).score;
    const five = riskScore({ ...base, brokenPromises: 5 }).score;
    expect(one).toBeGreaterThan(riskScore(base).score);
    expect(five - riskScore(base).score).toBeLessThanOrEqual(15);
  });

  it("floors the score at MEDIUM when a dispute is open", () => {
    const r = riskScore({ ...base, outstanding: 1, hasOpenDispute: true });
    expect(r.score).toBeGreaterThanOrEqual(30);
    expect(r.reasons).toContain("Open dispute awaiting resolution");
  });

  it("explains every scoring driver in reasons", () => {
    const r = riskScore({
      ...base,
      maxDaysOverdue: 45,
      brokenPromises: 2,
      latePaymentRatio: 0.8,
    });
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        "Oldest unpaid invoice is 45 days overdue",
        "2 payment promises not kept",
        "Usually pays after the due date",
      ])
    );
  });

  it("never exceeds 100", () => {
    const r = riskScore({
      ...base,
      outstanding: 99_000_000,
      maxDaysOverdue: 999,
      brokenPromises: 10,
      latePaymentRatio: 1,
      hasOpenDispute: true,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.level).toBe("CRITICAL");
  });
});

describe("levelForScore", () => {
  it("maps score bands to levels", () => {
    expect(levelForScore(0)).toBe("LOW");
    expect(levelForScore(19)).toBe("LOW");
    expect(levelForScore(20)).toBe("MEDIUM");
    expect(levelForScore(44)).toBe("MEDIUM");
    expect(levelForScore(45)).toBe("HIGH");
    expect(levelForScore(69)).toBe("HIGH");
    expect(levelForScore(70)).toBe("CRITICAL");
    expect(levelForScore(100)).toBe("CRITICAL");
  });
});
