import { describe, expect, it } from "vitest";
import {
  buildFollowUps,
  rankFollowUps,
  type FollowUp,
} from "../../packages/followups/rank";

// SY36 — ordering of the mobile sales "Today" tab: broken promises
// first, then amount × days overdue.

const NOW = new Date("2026-10-03T10:00:00+05:30");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => daysAgo(-n);

const party = (id: string, outstanding: number, phone: string | null = "9000000000") => ({
  id,
  name: id.toUpperCase(),
  city: null,
  phone,
  totalOutstanding: outstanding,
});

describe("mobile Today follow-ups", () => {
  it("ranks by amount × days overdue", () => {
    const rows = buildFollowUps(
      [party("small-old", 10_000), party("big-new", 500_000), party("mid", 100_000)],
      [
        { partyId: "small-old", dueDate: daysAgo(90) }, // 900k
        { partyId: "big-new", dueDate: daysAgo(3) }, // 1.5M
        { partyId: "mid", dueDate: daysAgo(5) }, // 500k
      ],
      [],
      [],
      NOW,
    );
    expect(rows.map((r) => r.partyId)).toEqual(["big-new", "small-old", "mid"]);
    expect(rows[1]!.daysOverdue).toBe(90);
  });

  it("puts a broken promise above a larger score", () => {
    const rows = buildFollowUps(
      [party("huge", 900_000), party("broke", 5_000)],
      [
        { partyId: "huge", dueDate: daysAgo(60) },
        { partyId: "broke", dueDate: daysAgo(10) },
      ],
      [
        {
          partyId: "broke",
          outcome: "PROMISE_TO_PAY",
          promiseDate: daysAgo(2),
          promiseAmount: 5000,
          performedAt: daysAgo(6),
        },
      ],
      [],
      NOW,
    );
    expect(rows.map((r) => r.partyId)).toEqual(["broke", "huge"]);
    expect(rows[0]!.brokenPromise).toBe(true);
  });

  it("hides a customer who promised a later date, shows one whose promise is due today", () => {
    const rows = buildFollowUps(
      [party("later", 50_000), party("today", 50_000)],
      [
        { partyId: "later", dueDate: daysAgo(20) },
        { partyId: "today", dueDate: daysAgo(20) },
      ],
      [
        { partyId: "later", outcome: "PROMISE_TO_PAY", promiseDate: daysAhead(4), promiseAmount: 1, performedAt: daysAgo(1) },
        { partyId: "today", outcome: "PROMISE_TO_PAY", promiseDate: NOW.toISOString(), promiseAmount: 1, performedAt: daysAgo(1) },
      ],
      [],
      NOW,
    );
    expect(rows.map((r) => r.partyId)).toEqual(["today"]);
    expect(rows[0]!.promiseDueToday).toBe(true);
    expect(rows[0]!.brokenPromise).toBe(false);
  });

  it("only the latest follow-up decides the promise state", () => {
    const rows = buildFollowUps(
      [party("p", 10_000)],
      [{ partyId: "p", dueDate: daysAgo(30) }],
      [
        { partyId: "p", outcome: "PROMISE_TO_PAY", promiseDate: daysAgo(10), promiseAmount: 1, performedAt: daysAgo(15) },
        { partyId: "p", outcome: "NO_ANSWER", promiseDate: null, promiseAmount: null, performedAt: daysAgo(1) },
      ],
      [],
      NOW,
    );
    expect(rows[0]!.brokenPromise).toBe(false);
  });

  it("skips customers with nothing overdue or nothing owed", () => {
    const rows = buildFollowUps(
      [party("not-due", 10_000), party("paid", 0)],
      [{ partyId: "paid", dueDate: daysAgo(30) }],
      [],
      [],
      NOW,
    );
    expect(rows).toEqual([]);
  });

  it("attaches the newest open payment link", () => {
    const rows = buildFollowUps(
      [party("p", 10_000)],
      [{ partyId: "p", dueDate: daysAgo(3) }],
      [],
      [
        { partyId: "p", shortUrl: "https://rzp.io/old", status: "created", createdAt: daysAgo(9) },
        { partyId: "p", shortUrl: "https://rzp.io/new", status: "created", createdAt: daysAgo(1) },
      ],
      NOW,
    );
    expect(rows[0]!.paymentLinkUrl).toBe("https://rzp.io/new");
  });

  it("rankFollowUps is stable for equal scores and never mutates its input", () => {
    const a = { partyId: "a", outstanding: 100, daysOverdue: 2, brokenPromise: false } as FollowUp;
    const b = { partyId: "b", outstanding: 200, daysOverdue: 1, brokenPromise: false } as FollowUp;
    const input = [a, b];
    expect(rankFollowUps(input).map((r) => r.partyId)).toEqual(["a", "b"]);
    expect(input).toEqual([a, b]);
  });
});
