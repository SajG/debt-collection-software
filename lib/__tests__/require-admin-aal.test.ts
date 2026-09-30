/**
 * SY2 regression guard: requireAdmin() must refuse an ADMIN whose
 * session is aal1 even if a verified TOTP factor exists. That is the
 * whole point of MFA — a password-only session cannot reach the
 * dashboard. This test asserts the redirect target ("/login/challenge")
 * so a future refactor cannot silently drop the gate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Redirect throws — we assert it was called with the right path.
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

// Stub the profile loader so requireProfile returns an active ADMIN.
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "admin-uuid" } },
      }),
    },
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    profile: {
      findUnique: async () => ({
        id: "admin-uuid",
        ownerName: "Test Admin",
        role: "ADMIN",
        isActive: true,
        businessName: "Test",
      }),
    },
    // SY23 — requireAdmin also reads BusinessSettings.requireManagement2fa
    // via resolveOrgIdFromProfile → $queryRaw + businessSettings.findUnique.
    // Return the "Synergy" posture (requireManagement2fa=true) so the
    // aal2 gate still fires exactly like the pre-SY23 behaviour.
    businessSettings: {
      findUnique: async () => ({ requireManagement2fa: true }),
    },
    $queryRaw: async () => [{ id: "org-uuid" }],
  },
}));

// The MFA helper is the surface we're gating on. Compose the two
// possible outcomes for the test scenarios.
const readMfaStatusMock = vi.fn();
vi.mock("@/lib/auth/mfa", () => ({
  readMfaStatus: () => readMfaStatusMock(),
}));

let requireAdmin: () => Promise<unknown>;

beforeEach(async () => {
  redirectMock.mockClear();
  readMfaStatusMock.mockReset();
  vi.resetModules();
  ({ requireAdmin } = await import("../authz"));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireAdmin — aal2 gate", () => {
  it("redirects an admin with a verified factor but aal1 session to /login/challenge", async () => {
    readMfaStatusMock.mockResolvedValue({
      factor: { kind: "verified", factorId: "f-1" },
      aal: "aal1",
    });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login/challenge");
    expect(redirectMock).toHaveBeenCalledWith("/login/challenge");
  });

  it("redirects an admin with no factor to /settings/security", async () => {
    readMfaStatusMock.mockResolvedValue({
      factor: { kind: "none" },
      aal: "aal1",
    });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/settings/security");
  });

  it("allows an admin whose session is aal2", async () => {
    readMfaStatusMock.mockResolvedValue({
      factor: { kind: "verified", factorId: "f-1" },
      aal: "aal2",
    });
    const profile = await requireAdmin();
    expect(redirectMock).not.toHaveBeenCalled();
    expect((profile as { role: string }).role).toBe("ADMIN");
  });
});
