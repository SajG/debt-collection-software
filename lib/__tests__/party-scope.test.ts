/**
 * partyScopeWhere / canAccessParty must match the RLS SELECT predicate
 * on public."Party" exactly. Regression guard for the "same user sees
 * different data on web vs mobile" bug: previously the STAFF branch
 * returned `{ OR: [{ assignedToId: profile.id }, { assignedToId: null }] }`
 * which let salespeople see every unassigned customer on the web while
 * RLS blocked those same rows on mobile.
 */

import { describe, expect, it } from "vitest";
import type { Profile } from "@prisma/client";
import { partyScopeWhere, canAccessParty } from "../authz-scope";

function fakeProfile(role: Profile["role"], id = "00000000-0000-0000-0000-000000000001"): Profile {
  // Only the fields authz.ts inspects are populated — the rest are
  // filled with defaults so TypeScript is happy.
  return {
    id,
    businessName: "Test",
    ownerName: "Test",
    phone: null,
    role,
    isActive: true,
    deactivatedAt: null,
    deactivatedById: null,
    createdById: null,
    costCentreName: null,
    notifyStatusChanges: true,
    notifyDocuments: true,
    notifyStaleOrders: true,
    notifyCreditIssues: true,
    notifyComments: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Profile;
}

describe("partyScopeWhere (must mirror party_select_staff RLS)", () => {
  it("STAFF is scoped strictly to assignedToId = profile.id", () => {
    const me = fakeProfile("STAFF", "aaaaaaaa-0000-0000-0000-000000000001");
    // Deep equality — must not contain an OR that adds assignedToId: null.
    expect(partyScopeWhere(me)).toEqual({ assignedToId: me.id });
  });

  it("STAFF scope does not include an unassigned-null branch", () => {
    const scope = partyScopeWhere(fakeProfile("STAFF"));
    const json = JSON.stringify(scope);
    // Both a raw "assignedToId":null and a Prisma "assignedToId":{"equals":null}
    // would re-widen. Either is a regression.
    expect(json).not.toContain('"assignedToId":null');
    expect(json).not.toContain('"assignedToId":{"equals":null}');
    expect(json).not.toMatch(/"OR"\s*:/);
  });

  it("ADMIN sees all parties (empty where)", () => {
    expect(partyScopeWhere(fakeProfile("ADMIN"))).toEqual({});
  });

  it("FACTORY sees all parties (matches party_select_factory RLS)", () => {
    expect(partyScopeWhere(fakeProfile("FACTORY"))).toEqual({});
  });
});

describe("canAccessParty (must mirror partyScopeWhere)", () => {
  const me = fakeProfile("STAFF", "aaaaaaaa-0000-0000-0000-000000000001");

  it("STAFF cannot read an unassigned party", () => {
    expect(canAccessParty(me, { assignedToId: null })).toBe(false);
  });

  it("STAFF cannot read a party owned by someone else", () => {
    expect(canAccessParty(me, { assignedToId: "bbbbbbbb-0000-0000-0000-000000000002" })).toBe(false);
  });

  it("STAFF can read a party assigned to them", () => {
    expect(canAccessParty(me, { assignedToId: me.id })).toBe(true);
  });

  it("ADMIN can read any party, assigned or not", () => {
    const admin = fakeProfile("ADMIN");
    expect(canAccessParty(admin, { assignedToId: null })).toBe(true);
    expect(canAccessParty(admin, { assignedToId: "cccccccc-0000-0000-0000-000000000003" })).toBe(true);
  });

  it("FACTORY can read any party, assigned or not", () => {
    const factory = fakeProfile("FACTORY");
    expect(canAccessParty(factory, { assignedToId: null })).toBe(true);
    expect(canAccessParty(factory, { assignedToId: "dddddddd-0000-0000-0000-000000000004" })).toBe(true);
  });
});
