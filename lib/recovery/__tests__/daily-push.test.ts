import { describe, expect, it } from "vitest";
import { compactINR, dailyPushRecipients, dailyPushText, isSundayIn } from "../daily-push";

describe("daily follow-up push", () => {
  it("formats amounts the Indian way, short", () => {
    expect(compactINR(340000)).toBe("₹3.4L");
    expect(compactINR(300000)).toBe("₹3L");
    expect(compactINR(12500000)).toBe("₹1.3Cr");
    expect(compactINR(45200)).toBe("₹45.2K");
    expect(compactINR(900)).toBe("₹900");
    expect(compactINR(0)).toBe("₹0");
  });

  it("matches the agreed wording", () => {
    expect(dailyPushText(6, 340000)).toEqual({ title: "Today", body: "6 customers, ₹3.4L to follow up" });
    expect(dailyPushText(1, 50000).body).toBe("1 customer, ₹50K to follow up");
  });

  it("skips Sunday in the company's timezone, not UTC's", () => {
    // 03:30 UTC Sunday = 09:00 IST Sunday
    expect(isSundayIn(new Date("2026-10-11T03:30:00Z"), "Asia/Kolkata")).toBe(true);
    // 20:00 UTC Saturday = 01:30 IST Sunday
    expect(isSundayIn(new Date("2026-10-10T20:00:00Z"), "Asia/Kolkata")).toBe(true);
    expect(isSundayIn(new Date("2026-10-12T03:30:00Z"), "Asia/Kolkata")).toBe(false);
  });

  it("one push per salesperson with work; none for empty days or people who left", () => {
    const byStaff = new Map([
      ["s1", [{ outstanding: 200000 }, { outstanding: 140000 }]],
      ["s2", []],
      ["gone", [{ outstanding: 5000 }]],
    ]);
    expect(dailyPushRecipients(byStaff, new Set(["s1", "s2"]))).toEqual([
      { profileId: "s1", title: "Today", body: "2 customers, ₹3.4L to follow up" },
    ]);
  });
});
