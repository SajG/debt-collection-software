/**
 * SY8 regression guard: every route under (dashboard) must redirect
 * an unauthenticated request to /login. The middleware handles this
 * — if a future refactor moves auth into a page-level check, a
 * server component that forgets to guard would leak.
 *
 * We stub Supabase so the middleware's getUser() returns "no user"
 * without needing real env vars, then walk a curated list of
 * dashboard paths through the middleware and assert every one is a
 * 3xx redirect with `Location: /login?callbackUrl=<original>`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock env before importing the middleware — Supabase SSR client
// reads these at construction time.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon";

// Stub the Supabase SSR client to always return "no user". Every
// other middleware branch (rate limit, CSP nonce, cookies) still
// runs unchanged.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  }),
}));

import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

const DASHBOARD_PATHS = [
  "/dashboard",
  "/orders",
  "/orders/new",
  "/orders/some-order-id",
  "/parties",
  "/parties/some-party-id",
  "/invoices",
  "/payments",
  "/payments/new",
  "/proformas",
  "/production",
  "/production/planning",
  "/production/some-order-id",
  "/admin/users",
  "/admin/approvals",
  "/admin/rate-approvals",
  "/admin/devices",
  "/admin/analytics",
  "/admin/reconciliation",
  "/admin/slipping",
  "/admin/unassigned",
  "/admin/products",
  "/admin/new-customer-names",
  "/settings",
  "/settings/security",
  "/stock",
  "/messages",
  "/import",
  "/worklist",
  "/onboarding",
];

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/account-disabled",
  "/robots.txt",
  "/status/some-token",
  "/api/webhooks/whatsapp",
  "/api/cron/tick",
  "/api/csp-report",
  "/api/v1/export-all",
];

function makeRequest(path: string): NextRequest {
  const url = new URL(`https://example.com${path}`);
  return new NextRequest(url, {
    headers: {
      "x-forwarded-for": "203.0.113.10",
    },
  });
}

describe("middleware — dashboard auth gate", () => {
  beforeEach(() => {
    // Reset rate-limit bucket between tests so hitting the login
    // path many times in one file doesn't trip the limiter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__syncitRate = new Map();
  });

  for (const path of DASHBOARD_PATHS) {
    it(`redirects unauthenticated ${path} → /login`, async () => {
      const res = await middleware(makeRequest(path));
      expect(res.status, path).toBeGreaterThanOrEqual(300);
      expect(res.status, path).toBeLessThan(400);
      const location = res.headers.get("location") ?? "";
      expect(location, path).toContain("/login");
      expect(location, path).toContain(
        `callbackUrl=${encodeURIComponent(path)}`,
      );
    });
  }

  it("does NOT redirect public paths", async () => {
    for (const path of PUBLIC_PATHS) {
      const res = await middleware(makeRequest(path));
      // Public paths return 200 (with security headers) or 204
      // (csp-report). Nothing 3xx here.
      expect([200, 204, 404], path).toContain(res.status);
    }
  });
});
