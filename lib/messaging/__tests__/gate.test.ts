import { describe, expect, it } from "vitest";
import { evaluateGate, type GateInput } from "../gate";

// 4 Jul 2026 12:00 IST == 06:30 UTC
const NOON_IST = new Date("2026-07-04T06:30:00Z");

const base: GateInput = {
  party: { consentStatus: "OPTED_IN", outreachPaused: false },
  settings: {
    timezone: "Asia/Kolkata",
    quietHoursStart: 8,
    quietHoursEnd: 19,
    maxMessagesPerDay: 1,
    maxMessagesPerWeek: 3,
  },
  recentOutboundAt: [],
  now: NOON_IST,
};

function istHour(hourIst: number): Date {
  // IST = UTC+5:30 → subtract 5.5h from local wall-clock to get UTC
  return new Date(Date.UTC(2026, 6, 4, hourIst - 6, 30));
}

describe("evaluateGate", () => {
  it("allows a consented party at midday with no recent messages", () => {
    expect(evaluateGate(base)).toEqual({ allowed: true });
  });

  it("blocks when the party opted out — even if everything else passes", () => {
    const r = evaluateGate({
      ...base,
      party: { ...base.party, consentStatus: "OPTED_OUT" },
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/opted out/);
  });

  it("blocks when outreach is paused (dispute)", () => {
    const r = evaluateGate({
      ...base,
      party: { ...base.party, outreachPaused: true },
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/paused/);
  });

  it("blocks when consent was never captured (UNKNOWN)", () => {
    const r = evaluateGate({
      ...base,
      party: { ...base.party, consentStatus: "UNKNOWN" },
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/consent/i);
  });

  it("enforces quiet hours in the configured timezone", () => {
    // 07:30 IST — before 8 AM
    const early = evaluateGate({ ...base, now: new Date("2026-07-04T02:00:00Z") });
    expect(early.allowed).toBe(false);

    // 19:30 IST — at/after 7 PM
    const late = evaluateGate({ ...base, now: new Date("2026-07-04T14:00:00Z") });
    expect(late.allowed).toBe(false);

    // boundary: 08:30 IST allowed, 18:30 IST allowed
    expect(evaluateGate({ ...base, now: istHour(8) }).allowed).toBe(true);
    expect(evaluateGate({ ...base, now: istHour(18) }).allowed).toBe(true);
    // 19:30 IST blocked (hour 19 >= end)
    expect(evaluateGate({ ...base, now: istHour(19) }).allowed).toBe(false);
  });

  it("enforces the daily cap per local calendar day", () => {
    const sentEarlierToday = new Date("2026-07-04T04:00:00Z"); // 09:30 IST same day
    const r = evaluateGate({ ...base, recentOutboundAt: [sentEarlierToday] });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/Daily/);
  });

  it("does not count yesterday's message against today's daily cap", () => {
    const yesterday = new Date("2026-07-03T06:30:00Z");
    const r = evaluateGate({ ...base, recentOutboundAt: [yesterday] });
    expect(r.allowed).toBe(true);
  });

  it("enforces the rolling weekly cap", () => {
    const days = [1, 3, 5].map(
      (d) => new Date(NOON_IST.getTime() - d * 24 * 60 * 60 * 1000)
    );
    const r = evaluateGate({ ...base, recentOutboundAt: days });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/Weekly/);
  });

  it("ignores messages older than 7 days for the weekly cap", () => {
    const old = [8, 9, 10].map(
      (d) => new Date(NOON_IST.getTime() - d * 24 * 60 * 60 * 1000)
    );
    const r = evaluateGate({ ...base, recentOutboundAt: old });
    expect(r.allowed).toBe(true);
  });

  it("counts failed attempts toward the daily cap (no provider hammering)", () => {
    const failedEarlierToday = new Date("2026-07-04T04:00:00Z"); // 09:30 IST same day
    const r = evaluateGate({ ...base, recentFailedAt: [failedEarlierToday] });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/Daily/);
  });

  it("does not count failed attempts toward the weekly cap", () => {
    // 3 failures on previous days would exhaust the weekly cap if counted.
    const failedPastDays = [1, 2, 3].map(
      (d) => new Date(NOON_IST.getTime() - d * 24 * 60 * 60 * 1000)
    );
    const r = evaluateGate({ ...base, recentFailedAt: failedPastDays });
    expect(r.allowed).toBe(true);
  });
});
