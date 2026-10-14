import { beforeAll, describe, expect, it } from "vitest";
import { dueLifecycleEmail, type LifecycleState } from "../platform/lifecycle";
import { unsubscribeUrl, verifyUnsubscribeToken } from "../unsubscribe-link";
import { makeStatementToken } from "../statement-link";
import { connectDataEmail, inviteTeamEmail, winBackEmail } from "../email/templates";

const base: LifecycleState = {
  ageDays: 0,
  plan: "TRIAL",
  status: "ACTIVE",
  lockReason: null,
  billingExempt: false,
  optedOut: false,
  milestones: new Set(),
  sent: new Set(["day0_welcome"]),
};
const at = (ageDays: number, over: Partial<LifecycleState> = {}) => dueLifecycleEmail({ ...base, ageDays, ...over });

describe("lifecycle emails", () => {
  it("sends each step in its window, once", () => {
    expect(at(0.2, { sent: new Set() })).toBe("day0_welcome");
    expect(at(0.2)).toBeNull(); // welcome already went at sign-up
    expect(at(1.1)).toBe("day1_connect_data");
    expect(at(1.1, { sent: new Set(["day0_welcome", "day1_connect_data"]) })).toBeNull();
    expect(at(3.2)).toBe("day3_invite_team");
    expect(at(5)).toBe("day3_invite_team"); // catches up after a missed run
    expect(at(8)).toBeNull();
  });

  it("skips a step that is already done", () => {
    expect(at(1.5, { milestones: new Set(["tally_connected"]) })).toBeNull();
    expect(at(1.5, { milestones: new Set(["data_imported"]) })).toBeNull();
    expect(at(3.5, { milestones: new Set(["team_invited"]) })).toBeNull();
  });

  it("win-back only for a trial that ended without a plan", () => {
    const ended = { status: "LOCKED", lockReason: "TRIAL_ENDED" };
    expect(at(31, ended)).toBe("day30_win_back");
    expect(at(31)).toBeNull(); // still active (trial was extended)
    expect(at(31, { ...ended, plan: "GROWTH" })).toBeNull();
    expect(at(31, { status: "LOCKED", lockReason: "PAYMENT_FAILED" })).toBeNull();
    expect(at(45, ended)).toBeNull();
  });

  it("an opted-out company gets no tips; exempt and deleting companies get nothing", () => {
    expect(at(1.5, { optedOut: true })).toBeNull();
    expect(at(3.5, { optedOut: true })).toBeNull();
    expect(at(31, { optedOut: true, status: "LOCKED", lockReason: "TRIAL_ENDED" })).toBeNull();
    expect(at(1.5, { billingExempt: true })).toBeNull();
    expect(at(0.1, { billingExempt: true, sent: new Set() })).toBeNull();
    expect(at(1.5, { status: "DELETING" })).toBeNull();
  });
});

describe("unsubscribe link", () => {
  const ORG = "0b8c6f0e-1111-4222-8333-444455556666";
  beforeAll(() => {
    process.env.STATUS_LINK_SECRET = "y".repeat(40);
    process.env.NEXT_PUBLIC_APP_URL = "https://getsyncit.app";
  });

  it("round-trips the company id", () => {
    const url = unsubscribeUrl(ORG);
    expect(url.startsWith("https://getsyncit.app/unsubscribe/")).toBe(true);
    expect(verifyUnsubscribeToken(url.split("/unsubscribe/")[1]!)).toBe(ORG);
  });

  it("refuses other kinds of signed link and garbage", () => {
    expect(verifyUnsubscribeToken(makeStatementToken(ORG))).toBeNull();
    expect(verifyUnsubscribeToken("x.y.z")).toBeNull();
  });

  it("every tip email carries the unsubscribe link, in HTML and text", () => {
    const input = { ownerName: "Asha", companyName: "Sample <Traders>", unsubscribeUrl: "https://getsyncit.app/unsubscribe/tok" };
    for (const mail of [connectDataEmail(input), inviteTeamEmail(input), winBackEmail(input)]) {
      expect(mail.html).toContain("https://getsyncit.app/unsubscribe/tok");
      expect(mail.text).toContain("https://getsyncit.app/unsubscribe/tok");
      expect(mail.html).not.toContain("<Traders>"); // escaped
    }
  });
});
