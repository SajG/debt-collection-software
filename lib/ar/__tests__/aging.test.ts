import { describe, expect, it } from "vitest";
import { agingBucket, agingSummary, daysOverdue } from "../aging";

const NOW = new Date(2026, 6, 4); // 4 Jul 2026

function daysAgo(n: number): Date {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n);
}

describe("daysOverdue", () => {
  it("is 0 when due today", () => {
    expect(daysOverdue(daysAgo(0), NOW)).toBe(0);
  });

  it("is negative when not yet due", () => {
    expect(daysOverdue(daysAgo(-5), NOW)).toBe(-5);
  });

  it("counts calendar days, ignoring time of day", () => {
    const dueLateEvening = new Date(2026, 5, 30, 23, 59);
    expect(daysOverdue(dueLateEvening, NOW)).toBe(4);
  });
});

describe("agingBucket", () => {
  it("buckets boundaries correctly", () => {
    expect(agingBucket(daysAgo(-1), NOW)).toBe("current");
    expect(agingBucket(daysAgo(0), NOW)).toBe("current");
    expect(agingBucket(daysAgo(1), NOW)).toBe("d0_30");
    expect(agingBucket(daysAgo(30), NOW)).toBe("d0_30");
    expect(agingBucket(daysAgo(31), NOW)).toBe("d31_60");
    expect(agingBucket(daysAgo(60), NOW)).toBe("d31_60");
    expect(agingBucket(daysAgo(61), NOW)).toBe("d61_90");
    expect(agingBucket(daysAgo(90), NOW)).toBe("d61_90");
    expect(agingBucket(daysAgo(91), NOW)).toBe("d90_plus");
    expect(agingBucket(daysAgo(500), NOW)).toBe("d90_plus");
  });
});

describe("agingSummary", () => {
  it("sums pending amounts per bucket and skips settled invoices", () => {
    const summary = agingSummary(
      [
        { dueDate: daysAgo(-10), pending: 100 },
        { dueDate: daysAgo(5), pending: 200 },
        { dueDate: daysAgo(25), pending: 300 },
        { dueDate: daysAgo(45), pending: 400 },
        { dueDate: daysAgo(100), pending: 500 },
        { dueDate: daysAgo(100), pending: 0 }, // paid — excluded
      ],
      NOW
    );
    expect(summary).toEqual({
      current: 100,
      d0_30: 500,
      d31_60: 400,
      d61_90: 0,
      d90_plus: 500,
    });
  });
});
