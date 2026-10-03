/**
 * SY31 — web permissions come from the ACTIVE Membership, never from
 * Profile.role, and there is no default-company fallback:
 *   - no active membership → /onboarding (pages) / 403 (API)
 *   - a Synergy STAFF who is ADMIN of another company is STAFF while
 *     Synergy is the active company
 *   - several memberships but no valid active_org_id claim → /onboarding
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

type Membership = {
  organizationId: string;
  role: "ADMIN" | "STAFF" | "FACTORY";
  isOwner: boolean;
};

const state: {
  appMetadata: Record<string, unknown>;
  profileRole: "ADMIN" | "STAFF" | "FACTORY";
  memberships: Membership[];
} = { appMetadata: {}, profileRole: "ADMIN", memberships: [] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-uuid", app_metadata: state.appMetadata } },
      }),
      signOut: async () => ({}),
    },
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    // tenantDb() wraps db.$extends; the mock needs no scoping.
    $extends() {
      return this;
    },
    profile: {
      findUnique: async () => ({
        id: "user-uuid",
        ownerName: "Test",
        businessName: "Test",
        role: state.profileRole,
        isActive: true,
      }),
    },
    membership: {
      findMany: async () => state.memberships,
    },
    businessSettings: {
      findUnique: async () => ({ requireManagement2fa: false }),
    },
    $queryRaw: async () => {
      throw new Error("no raw default-company lookup expected");
    },
  },
}));

vi.mock("@/lib/auth/mfa", () => ({
  readMfaStatus: async () => ({ factor: { kind: "none" }, aal: "aal1" }),
}));

const SYNERGY = "11111111-1111-1111-1111-111111111111";
const TESTCO = "22222222-2222-2222-2222-222222222222";

let authz: typeof import("../authz");

beforeEach(async () => {
  redirectMock.mockClear();
  state.appMetadata = {};
  state.profileRole = "ADMIN";
  state.memberships = [];
  vi.resetModules();
  authz = await import("../authz");
});

describe("no active membership", () => {
  it("requireProfile redirects to /onboarding even when Profile.role is ADMIN", async () => {
    await expect(authz.requireProfile()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("requireAdmin redirects to /onboarding", async () => {
    await expect(authz.requireAdmin()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("requireFactoryOrAdmin never falls back to a default company", async () => {
    await expect(authz.requireFactoryOrAdmin()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("requireProfileApi returns 403", async () => {
    const res = await authz.requireProfileApi();
    expect(res.profile).toBeNull();
    expect(res.failure?.status).toBe(403);
  });
});

describe("Synergy STAFF who is ADMIN of a test company", () => {
  beforeEach(() => {
    state.profileRole = "ADMIN";
    state.memberships = [
      { organizationId: SYNERGY, role: "STAFF", isOwner: false },
      { organizationId: TESTCO, role: "ADMIN", isOwner: true },
    ];
  });

  it("is STAFF while Synergy is active", async () => {
    state.appMetadata = { active_org_id: SYNERGY };
    const profile = await authz.requireProfile();
    expect(profile.role).toBe("STAFF");
    await expect(authz.requireAdmin()).rejects.toThrow("REDIRECT:/dashboard");
    expect(profile.organizationId).toBe(SYNERGY);
    const api = await authz.requireProfileApi({ adminOnly: true });
    expect(api.failure?.status).toBe(403);
  });

  it("is ADMIN while the test company is active", async () => {
    state.appMetadata = { active_org_id: TESTCO };
    const profile = await authz.requireAdmin();
    expect(profile.role).toBe("ADMIN");
    expect(profile.organizationId).toBe(TESTCO);
  });

  it("without an active_org_id claim goes to /onboarding to choose", async () => {
    await expect(authz.requireProfile()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("a claim for a company they aren't in grants nothing", async () => {
    state.appMetadata = { active_org_id: "33333333-3333-3333-3333-333333333333" };
    await expect(authz.requireProfile()).rejects.toThrow("REDIRECT:/onboarding");
  });
});

describe("single membership", () => {
  it("uses its role even without a claim", async () => {
    state.profileRole = "ADMIN";
    state.memberships = [{ organizationId: TESTCO, role: "FACTORY", isOwner: false }];
    const profile = await authz.requireFactoryOrAdmin();
    expect(profile.role).toBe("FACTORY");
  });
});
