import { describe, expect, it } from "vitest";
import { buildDailyPlan, bucketSlip, type PlanParty } from "../plan";

function party(overrides: Partial<PlanParty>): PlanParty {
  return {
    partyId: "p1",
    partyName: "Sharma Traders",
    phone: "9876543210",
    assignedToId: "staff-1",
    outstanding: 100_000,
    score: 50,
    reasons: [],
    ...overrides,
  };
}

describe("bucketSlip", () => {
  it("detects an invoice about to cross into the next aging bucket", () => {
    expect(bucketSlip(25)).toEqual({ daysToSlip: 6, nextBucket: "31–60 days" });
    expect(bucketSlip(-3)).toEqual({ daysToSlip: 4, nextBucket: "0–30 days" });
  });
  it("returns null deep inside 90+ (no further bucket)", () => {
    expect(bucketSlip(95)).toBeNull();
  });
  it("returns null when the slip is more than 7 days away", () => {
    expect(bucketSlip(35)).toBeNull();
  });
});

describe("buildDailyPlan", () => {
  it("groups by assigned staff and routes unassigned to the admin list", () => {
    const plan = buildDailyPlan([
      party({ partyId: "a", assignedToId: "s1", reasons: [{ kind: "promise_due", promiseDate: new Date(), promiseAmount: 5000 }] }),
      party({ partyId: "b", assignedToId: null, reasons: [{ kind: "stale_high_risk", daysSinceLastAction: 20 }] }),
    ]);
    expect(plan.byStaff.get("s1")).toHaveLength(1);
    expect(plan.unassigned).toHaveLength(1);
  });

  it("orders by reason weight (promise > slip > stale > top-up), then score", () => {
    const plan = buildDailyPlan([
      party({ partyId: "top", score: 99, reasons: [] }),
      party({ partyId: "stale", score: 10, reasons: [{ kind: "stale_high_risk", daysSinceLastAction: 15 }] }),
      party({ partyId: "promise", score: 5, reasons: [{ kind: "promise_due", promiseDate: new Date(), promiseAmount: null }] }),
    ]);
    const ids = (plan.byStaff.get("staff-1") ?? []).map((p) => p.partyId);
    expect(ids).toEqual(["promise", "stale", "top"]);
  });

  it("adds top_score reason only to reason-less parties within topN", () => {
    const plan = buildDailyPlan(
      [party({ partyId: "x", reasons: [] }), party({ partyId: "y", score: 1, reasons: [] })],
      { topN: 1 }
    );
    const entries = plan.byStaff.get("staff-1") ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0].partyId).toBe("x");
    expect(entries[0].reasons[0].kind).toBe("top_score");
  });

  it("returns empty structures for no input", () => {
    const plan = buildDailyPlan([]);
    expect(plan.byStaff.size).toBe(0);
    expect(plan.unassigned).toEqual([]);
  });
});
