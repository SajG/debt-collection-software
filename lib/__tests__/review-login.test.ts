import { describe, expect, it, vi } from "vitest";
import {
  enabledReviewEmails,
  isReviewEmail,
  reviewLogin,
  REVIEW_ACCOUNTS,
  type ReviewLoginDeps,
} from "../platform/review-login";

// SY37 — the fixed review code must open the three demo accounts and
// nothing else. In-memory deps; no database.

const SALES = "review-sales@getsyncit.app";
const ALL = REVIEW_ACCOUNTS.map((a) => a.email).join(",");
const env = (over: Record<string, string | undefined> = {}) =>
  ({ REVIEW_LOGIN_EMAILS: ALL, REVIEW_LOGIN_CODE: "482913", ...over }) as unknown as NodeJS.ProcessEnv;

const DEMO = { organizationId: "org-demo", slug: "syncit-demo", deletedAt: null };

function deps(over: Partial<ReviewLoginDeps> = {}) {
  const d = {
    env: env(),
    isRateLimited: vi.fn(async () => false),
    recordAttempt: vi.fn(async () => undefined),
    findAccount: vi.fn(async () => ({ profileId: "p1", isActive: true, memberships: [DEMO] })),
    mintSession: vi.fn(async () => ({ accessToken: "at", refreshToken: "rt" })),
    audit: vi.fn(async () => undefined),
    ...over,
  };
  return d as typeof d & ReviewLoginDeps;
}
const call = (d: ReviewLoginDeps, email = SALES, code = "482913") =>
  reviewLogin({ email, code, ip: "1.2.3.4", userAgent: "ua" }, d);

describe("review login", () => {
  it("signs a review account in to the demo company and logs it", async () => {
    const d = deps();
    expect(await call(d)).toEqual({ ok: true, accessToken: "at", refreshToken: "rt" });
    expect(d.mintSession).toHaveBeenCalledWith({ profileId: "p1", email: SALES, organizationId: "org-demo" });
    expect(d.audit).toHaveBeenCalledWith({
      profileId: "p1", email: SALES, organizationId: "org-demo", ip: "1.2.3.4", userAgent: "ua",
    });
    expect(d.recordAttempt).toHaveBeenCalledWith(SALES, true);
  });

  it("is case- and space-insensitive on the email", async () => {
    expect((await call(deps(), "  Review-Sales@GetSyncit.app ")).ok).toBe(true);
  });

  it("refuses any other email, even with the right code, and records nothing", async () => {
    for (const email of ["owner@realco.in", "review-sales@getsyncit.app.evil.com", "review-admin@getsyncit.app"]) {
      const d = deps();
      expect(await call(d, email)).toEqual({ ok: false, reason: "not_review_email" });
      expect(d.findAccount).not.toHaveBeenCalled();
      expect(d.mintSession).not.toHaveBeenCalled();
      expect(d.recordAttempt).not.toHaveBeenCalled();
    }
  });

  it("an address added to REVIEW_LOGIN_EMAILS that is not one of the three is ignored", async () => {
    const e = env({ REVIEW_LOGIN_EMAILS: `${ALL},owner@realco.in` });
    expect(enabledReviewEmails(e).has("owner@realco.in")).toBe(false);
    expect(isReviewEmail("owner@realco.in", e)).toBe(false);
    const d = deps({ env: e });
    expect(await call(d, "owner@realco.in")).toEqual({ ok: false, reason: "not_review_email" });
    expect(d.mintSession).not.toHaveBeenCalled();
  });

  it("the env list can narrow the three", async () => {
    const d = deps({ env: env({ REVIEW_LOGIN_EMAILS: "review-manager@getsyncit.app" }) });
    expect(await call(d, SALES)).toEqual({ ok: false, reason: "not_review_email" });
  });

  it("is off when either variable is missing or the code is not 6 digits", async () => {
    for (const e of [
      env({ REVIEW_LOGIN_CODE: undefined }),
      env({ REVIEW_LOGIN_EMAILS: undefined }),
      env({ REVIEW_LOGIN_EMAILS: "" }),
      env({ REVIEW_LOGIN_CODE: "" }),
      env({ REVIEW_LOGIN_CODE: "12345" }),
      env({ REVIEW_LOGIN_CODE: "abcdef" }),
    ]) {
      const d = deps({ env: e });
      const r = await call(d, SALES, e.REVIEW_LOGIN_CODE ?? "");
      expect(r.ok).toBe(false);
      expect(d.mintSession).not.toHaveBeenCalled();
    }
  });

  it("refuses a wrong code and counts it", async () => {
    const d = deps();
    expect(await call(d, SALES, "000000")).toEqual({ ok: false, reason: "wrong_code" });
    expect(d.recordAttempt).toHaveBeenCalledWith(SALES, false);
    expect(d.mintSession).not.toHaveBeenCalled();
  });

  it("refuses while locked out, before looking at the code", async () => {
    const d = deps({ isRateLimited: vi.fn(async () => true) });
    expect(await call(d)).toEqual({ ok: false, reason: "rate_limited" });
    expect(d.mintSession).not.toHaveBeenCalled();
  });

  it("refuses a review account that belongs to any other company", async () => {
    const real = { organizationId: "org-real", slug: "synergy", deletedAt: null };
    for (const memberships of [[real], [DEMO, real], [], [{ ...DEMO, deletedAt: new Date() }]]) {
      const d = deps({ findAccount: vi.fn(async () => ({ profileId: "p1", isActive: true, memberships })) });
      expect(await call(d)).toEqual({ ok: false, reason: "not_demo_only" });
      expect(d.mintSession).not.toHaveBeenCalled();
      expect(d.audit).not.toHaveBeenCalled();
    }
  });

  it("refuses a missing or deactivated account", async () => {
    for (const account of [null, { profileId: "p1", isActive: false, memberships: [DEMO] }]) {
      const d = deps({ findAccount: vi.fn(async () => account) });
      expect(await call(d)).toEqual({ ok: false, reason: "account_missing" });
      expect(d.mintSession).not.toHaveBeenCalled();
    }
  });

  it("does not log a use when no session could be minted", async () => {
    const d = deps({ mintSession: vi.fn(async () => null) });
    expect(await call(d)).toEqual({ ok: false, reason: "mint_failed" });
    expect(d.audit).not.toHaveBeenCalled();
  });
});
