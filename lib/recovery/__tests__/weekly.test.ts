import { describe, expect, it } from "vitest";
import { buildWeeklySummary, overdueAsOf, weeklySummaryIsEmpty } from "../weekly";

const d = (s: string) => new Date(`${s}T09:00:00`);
const NOW = d("2026-10-12"); // a Monday

const parties = [
  { id: "a", name: "Alpha Traders", outstanding: 150000, salesperson: "Rohan" },
  { id: "b", name: "Bravo Stores", outstanding: 40000, salesperson: null },
  { id: "c", name: "Charlie & Co", outstanding: 0, salesperson: "Rohan" },
];
const invoices = [
  // overdue for a month, part-paid 3 days ago
  { partyId: "a", dueDate: d("2026-09-10"), totalAmount: 100000, settlements: [{ at: d("2026-10-09"), amount: 30000 }] },
  // fell due 2 days ago — not overdue last week
  { partyId: "a", dueDate: d("2026-10-10"), totalAmount: 80000, settlements: [] },
  { partyId: "b", dueDate: d("2026-08-01"), totalAmount: 40000, settlements: [] },
  // was overdue last week, cleared since
  { partyId: "c", dueDate: d("2026-09-20"), totalAmount: 25000, settlements: [{ at: d("2026-10-08"), amount: 25000 }] },
];

describe("weekly management summary", () => {
  it("rebuilds last week's overdue from what had been paid by then", () => {
    const then = overdueAsOf(invoices, d("2026-10-05"));
    expect(then.get("a")?.amount).toBe(100000);
    expect(then.get("b")?.amount).toBe(40000);
    expect(then.get("c")?.amount).toBe(25000);
    const now = overdueAsOf(invoices, NOW);
    expect(now.get("a")?.amount).toBe(150000);
    expect(now.has("c")).toBe(false);
  });

  it("reports the trend, money received against target, and who is most overdue", () => {
    const s = buildWeeklySummary({
      now: NOW,
      parties,
      invoices,
      paymentsThisMonth: [
        { at: d("2026-10-02"), amount: 10000 },
        { at: d("2026-10-08"), amount: 25000 },
        { at: d("2026-10-09"), amount: 30000 },
      ],
      monthTarget: 260000,
      brokenPromises: [{ partyId: "b", promiseDate: d("2026-10-06"), promiseAmount: 40000 }],
    });
    expect(s.outstanding).toBe(190000);
    expect(s.overdueLastWeek).toBe(165000);
    expect(s.overdueNow).toBe(190000);
    expect(s.overdueChange).toBe(25000);
    expect(s.overdueChangePct).toBe(15.2);
    expect(s.receivedThisMonth).toBe(65000);
    expect(s.receivedThisWeek).toBe(55000);
    expect(s.targetPct).toBe(25);
    expect(s.topOverdue.map((t) => [t.name, t.overdue])).toEqual([
      ["Alpha Traders", 150000],
      ["Bravo Stores", 40000],
    ]);
    expect(s.topOverdue[0]!.daysOverdue).toBe(32);
    expect(s.brokenPromises).toEqual([
      { name: "Bravo Stores", promiseDate: d("2026-10-06"), promiseAmount: 40000, outstanding: 40000, salesperson: null },
    ]);
  });

  it("caps the overdue list at ten and handles no target / nothing last week", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, outstanding: 1000 + i, salesperson: null }));
    const s = buildWeeklySummary({
      now: NOW,
      parties: many,
      invoices: many.map((p, i) => ({ partyId: p.id, dueDate: d("2026-10-08"), totalAmount: 1000 + i, settlements: [] })),
      paymentsThisMonth: [],
      monthTarget: 0,
      brokenPromises: [],
    });
    expect(s.topOverdue).toHaveLength(10);
    expect(s.topOverdue[0]!.name).toBe("P13");
    expect(s.targetPct).toBeNull();
    expect(s.overdueChangePct).toBeNull();
  });

  it("knows when there is nothing to say", () => {
    const empty = buildWeeklySummary({ now: NOW, parties: [], invoices: [], paymentsThisMonth: [], monthTarget: 0, brokenPromises: [] });
    expect(weeklySummaryIsEmpty(empty)).toBe(true);
  });
});
