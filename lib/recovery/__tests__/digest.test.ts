import { describe, expect, it } from "vitest";
import { renderStaffDigest, renderAdminDigest } from "../digest";
import type { DailyPlan, PlanParty } from "../plan";

const entry: PlanParty = {
  partyId: "p1",
  partyName: "Sharma Traders",
  phone: "9876543210",
  assignedToId: "s1",
  outstanding: 125_000,
  score: 70,
  reasons: [{ kind: "promise_due", promiseDate: new Date("2026-07-21"), promiseAmount: 50_000 }],
};

describe("renderStaffDigest", () => {
  it("lists parties with amount and reason", () => {
    const text = renderStaffDigest("Ravi", [entry], new Date("2026-07-21"));
    expect(text).toContain("Ravi");
    expect(text).toContain("Sharma Traders");
    expect(text).toContain("1,25,000");
    expect(text.toLowerCase()).toContain("promise");
  });

  it("says all clear when there is nothing to chase", () => {
    const text = renderStaffDigest("Ravi", [], new Date("2026-07-21"));
    expect(text.toLowerCase()).toContain("no follow-ups");
  });
});

describe("renderAdminDigest", () => {
  it("summarises per staff member with totals", () => {
    const plan: DailyPlan = { byStaff: new Map([["s1", [entry]]]), unassigned: [entry] };
    const text = renderAdminDigest(plan, new Map([["s1", "Ravi"]]), new Date("2026-07-21"));
    expect(text).toContain("Ravi: 1");
    expect(text).toContain("Unassigned: 1");
  });
});
