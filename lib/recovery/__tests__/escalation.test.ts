import { describe, expect, it } from "vitest";
import { shouldAutoFlag, nextStage } from "../escalation";

describe("shouldAutoFlag", () => {
  it("does not flag below both thresholds", () => {
    expect(
      shouldAutoFlag({ outstanding: 49_999, maxDaysOverdue: 59, brokenPromises: 1 })
    ).toEqual({ flag: false });
  });

  it("flags at exactly 60 days overdue AND ₹50,000", () => {
    const v = shouldAutoFlag({ outstanding: 50_000, maxDaysOverdue: 60, brokenPromises: 0 });
    expect(v.flag).toBe(true);
    if (v.flag) expect(v.reason).toContain("60");
  });

  it("does not flag 60 days overdue with small outstanding", () => {
    expect(
      shouldAutoFlag({ outstanding: 10_000, maxDaysOverdue: 200, brokenPromises: 0 })
    ).toEqual({ flag: false });
  });

  it("does not flag large outstanding that is not yet 60d overdue", () => {
    expect(
      shouldAutoFlag({ outstanding: 900_000, maxDaysOverdue: 59, brokenPromises: 1 })
    ).toEqual({ flag: false });
  });

  it("flags on 2+ broken promises regardless of amount", () => {
    const v = shouldAutoFlag({ outstanding: 5_000, maxDaysOverdue: 0, brokenPromises: 2 });
    expect(v.flag).toBe(true);
    if (v.flag) expect(v.reason.toLowerCase()).toContain("promise");
  });
});

describe("nextStage", () => {
  it("walks the ladder in order and stops at LEGAL", () => {
    expect(nextStage("FLAGGED")).toBe("NOTICE");
    expect(nextStage("NOTICE")).toBe("FINAL_NOTICE");
    expect(nextStage("FINAL_NOTICE")).toBe("LEGAL");
    expect(nextStage("LEGAL")).toBeNull();
  });
});
