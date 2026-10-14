import { describe, expect, it } from "vitest";
import { planReminders, reminderKindFor } from "../reminder-plan";

const TZ = "Asia/Kolkata";
// 10:30 IST on 7 Oct 2026 — when the cron runs (05:00 UTC).
const NOW = new Date("2026-10-07T05:00:00Z");
const ist = (day: string) => new Date(`${day}T00:00:00+05:30`);
const inv = (id: string, partyId: string, due: string, pending = 1000) => ({ id, partyId, dueDate: ist(due), pending });

describe("reminder plan", () => {
  it("classifies by the company's local calendar day", () => {
    expect(reminderKindFor(ist("2026-10-06"), NOW, TZ)).toBe("overdue");
    expect(reminderKindFor(ist("2026-10-07"), NOW, TZ)).toBe("due_today");
    expect(reminderKindFor(ist("2026-10-10"), NOW, TZ)).toBe("upcoming");
    for (const d of ["2026-10-08", "2026-10-09", "2026-10-11", "2026-11-01"]) {
      expect(reminderKindFor(ist(d), NOW, TZ)).toBeNull();
    }
  });

  it("uses the local day, not the UTC day, near midnight", () => {
    // 23:30 IST on the 7th is still 18:00 UTC on the 7th; 00:30 IST on
    // the 8th is 19:00 UTC on the 7th — the local day decides.
    const lateEvening = new Date("2026-10-07T19:00:00Z"); // 00:30 IST, 8 Oct
    expect(reminderKindFor(ist("2026-10-08"), lateEvening, TZ)).toBe("due_today");
    expect(reminderKindFor(ist("2026-10-07"), lateEvening, TZ)).toBe("overdue");
    // A due date stored as UTC midnight still lands on the right IST day.
    expect(reminderKindFor(new Date("2026-10-07T00:00:00Z"), NOW, TZ)).toBe("due_today");
  });

  it("sends one reminder per customer: overdue beats due-today beats upcoming", () => {
    const plan = planReminders(
      [
        inv("a-up", "A", "2026-10-10"),
        inv("a-today", "A", "2026-10-07"),
        inv("a-old", "A", "2026-09-01"),
        inv("a-older", "A", "2026-08-01"),
        inv("b-up", "B", "2026-10-10"),
        inv("b-today", "B", "2026-10-07"),
        inv("c-up", "C", "2026-10-10"),
        inv("d-none", "D", "2026-10-09"),
      ],
      NOW,
      TZ,
    );
    expect(plan).toEqual([
      { partyId: "A", invoiceId: "a-older", kind: "overdue" },
      { partyId: "B", invoiceId: "b-today", kind: "due_today" },
      { partyId: "C", invoiceId: "c-up", kind: "upcoming" },
    ]);
  });

  it("ignores invoices with nothing left to pay", () => {
    expect(planReminders([inv("x", "A", "2026-10-07", 0), inv("y", "A", "2026-09-01", -5)], NOW, TZ)).toEqual([]);
  });
});
