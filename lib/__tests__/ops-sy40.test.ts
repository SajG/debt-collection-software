import { describe, expect, it } from "vitest";
import { isLate, summariseCronBody } from "@/lib/platform/cron-run";
import { checkPreviewIsolation } from "@/lib/platform/env-guard";
import { overallStatus, resendAnswerIsHealthy } from "@/lib/platform/health";
import { isPlatformAdminEmail, parsePlatformAdmins } from "@/lib/platform/admin";

// SY40 — the pure rules behind cron logging, the health check, the
// Preview-vs-production guard and the operator console allow-list.

describe("summariseCronBody", () => {
  it("reads per-company crons", () => {
    const r = summariseCronBody({ orgsProcessed: 4, orgsFailed: 1, perOrg: [{ errors: 2 }, { errors: 0 }] });
    expect(r.orgCount).toBe(5);
    expect(r.failures).toBe(3);
  });
  it("reads flat summaries", () => {
    expect(summariseCronBody({ reminded: 2, purged: 1, failed: 1 })).toMatchObject({ orgCount: 0, failures: 1 });
    expect(summariseCronBody({ endingSoonNotified: 3, errors: 0 }).failures).toBe(0);
  });
  it("keeps only top-level numbers as detail — never names or rows", () => {
    const r = summariseCronBody({
      orgsProcessed: 1,
      perOrg: [{ orgSlug: "acme", notified: 2 }],
      wouldSend: [{ org: "Acme Pipes", email: "owner@acme.example" }],
      note: "hello",
    });
    expect(r.detail).toEqual({ orgsProcessed: 1 });
    expect(JSON.stringify(r.detail)).not.toContain("acme");
  });
  it("survives junk", () => {
    expect(summariseCronBody(null)).toEqual({ orgCount: 0, failures: 0, detail: {} });
    expect(summariseCronBody("x")).toEqual({ orgCount: 0, failures: 0, detail: {} });
  });
});

describe("isLate", () => {
  const now = new Date("2026-10-07T10:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  it("never-run jobs are late", () => expect(isLate(null, 10, now)).toBe(true));
  it("10-minute job: fine at 25 min, late at 35", () => {
    expect(isLate(ago(25), 10, now)).toBe(false);
    expect(isLate(ago(35), 10, now)).toBe(true);
  });
  it("daily job: fine at 30 h, late at 37 h", () => {
    expect(isLate(ago(30 * 60), 1440, now)).toBe(false);
    expect(isLate(ago(37 * 60), 1440, now)).toBe(true);
  });
});

describe("checkPreviewIsolation", () => {
  const prod = "abcdprodref";
  it("ignores production and local", () => {
    expect(checkPreviewIsolation({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: `https://${prod}.supabase.co`, PRODUCTION_SUPABASE_REF: prod })).toEqual({ ok: true });
    expect(checkPreviewIsolation({})).toEqual({ ok: true });
  });
  it("refuses a preview on the production project (API url or database url)", () => {
    const a = checkPreviewIsolation({ VERCEL_ENV: "preview", PRODUCTION_SUPABASE_REF: prod, NEXT_PUBLIC_SUPABASE_URL: `https://${prod}.supabase.co` });
    expect(a.ok).toBe(false);
    const b = checkPreviewIsolation({
      VERCEL_ENV: "preview",
      PRODUCTION_SUPABASE_REF: prod,
      NEXT_PUBLIC_SUPABASE_URL: "https://stagingref.supabase.co",
      DATABASE_URL: `postgresql://postgres.${prod}:pw@pooler.supabase.com:6543/postgres`,
    });
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.reason).toContain("DATABASE_URL");
      expect(b.reason).not.toContain("pw@");
    }
  });
  it("passes a preview on staging, warns when the ref is not configured", () => {
    expect(checkPreviewIsolation({ VERCEL_ENV: "preview", PRODUCTION_SUPABASE_REF: prod, NEXT_PUBLIC_SUPABASE_URL: "https://stagingref.supabase.co" })).toEqual({ ok: true });
    const w = checkPreviewIsolation({ VERCEL_ENV: "preview" });
    expect(w.ok).toBe(true);
    expect(w.ok && w.warning).toBeTruthy();
  });
});

describe("health rules", () => {
  const up = { ok: true, ms: 1 };
  const no = { ok: false, ms: 1 };
  it("database or sign-in failing is down; only email failing is degraded", () => {
    expect(overallStatus({ database: up, auth: up, email: up })).toBe("ok");
    expect(overallStatus({ database: up, auth: up, email: no })).toBe("degraded");
    expect(overallStatus({ database: no, auth: up, email: up })).toBe("down");
    expect(overallStatus({ database: up, auth: no, email: no })).toBe("down");
  });
  it("accepts a send-only Resend key, rejects a wrong one", () => {
    expect(resendAnswerIsHealthy(200, { data: [] })).toBe(true);
    expect(resendAnswerIsHealthy(401, { name: "restricted_api_key" })).toBe(true);
    expect(resendAnswerIsHealthy(401, { name: "validation_error" })).toBe(false);
    expect(resendAnswerIsHealthy(500, null)).toBe(false);
  });
});

describe("platform admin allow-list", () => {
  it("empty or unset means nobody", () => {
    expect(isPlatformAdminEmail("a@b.co", undefined)).toBe(false);
    expect(isPlatformAdminEmail("a@b.co", "")).toBe(false);
    expect(isPlatformAdminEmail(null, "a@b.co")).toBe(false);
  });
  it("exact address only, case-insensitive", () => {
    const raw = " Owner@Getsyncit.app , ops@getsyncit.app,";
    expect(parsePlatformAdmins(raw).size).toBe(2);
    expect(isPlatformAdminEmail("owner@getsyncit.app", raw)).toBe(true);
    expect(isPlatformAdminEmail("owner@getsyncit.app.evil.com", raw)).toBe(false);
    expect(isPlatformAdminEmail("xowner@getsyncit.app", raw)).toBe(false);
  });
});
