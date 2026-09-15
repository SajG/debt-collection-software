import { describe, expect, it } from "vitest";
import { rulesFallback } from "../fallback";

describe("rulesFallback", () => {
  it("maps CRITICAL risk to a today-urgency visit recommendation", () => {
    const rec = rulesFallback(
      { score: 85, level: "CRITICAL", reasons: ["Oldest unpaid invoice is 200 days overdue"] },
      { partyName: "Sharma Traders", outstanding: 600_000, maxDaysOverdue: 200 }
    );
    expect(rec.urgency).toBe("today");
    expect(rec.talkingPoints.length).toBeGreaterThan(0);
    expect(rec.draftMessage).toContain("Sharma Traders");
  });

  it("maps LOW risk to this_month", () => {
    const rec = rulesFallback(
      { score: 10, level: "LOW", reasons: [] },
      { partyName: "Kale Hardware", outstanding: 8_000, maxDaysOverdue: 5 }
    );
    expect(rec.urgency).toBe("this_month");
  });
});
