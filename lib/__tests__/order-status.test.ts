/**
 * P1 — every OrderStatus the DB can store must have a label (and a
 * factory-visibility rule) so a backfilled row cannot render as a
 * blank badge. Pure unit tests; no DB.
 */

import { describe, expect, it } from "vitest";
import { OrderStatus } from "@prisma/client";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEQUENCE,
  isFactoryHiddenOrder,
  isTerminalOrderStatus,
  nextOrderStatus,
} from "../orders/status";
import { canAccessOrder } from "../authz-scope";
import type { Profile } from "@prisma/client";

function fakeProfile(role: Profile["role"]): Profile {
  return {
    id: "00000000-0000-0000-0000-000000000001",
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

describe("ORDER_STATUS_LABELS (P1 UI contract)", () => {
  it("covers every OrderStatus enum value", () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ORDER_STATUS_LABELS[status], status).toEqual(expect.any(String));
      expect(ORDER_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("places PENDING_APPROVAL before ORDER_PLACED in the sequence", () => {
    expect(ORDER_STATUS_SEQUENCE[0]).toBe("PENDING_APPROVAL");
    expect(ORDER_STATUS_SEQUENCE[1]).toBe("ORDER_PLACED");
  });

  it("does not auto-advance PENDING_APPROVAL or REJECTED", () => {
    expect(nextOrderStatus("PENDING_APPROVAL")).toBeNull();
    expect(nextOrderStatus("REJECTED")).toBeNull();
    expect(nextOrderStatus("ORDER_PLACED")).toBe("IN_PRODUCTION");
  });

  it("treats REJECTED as terminal", () => {
    expect(isTerminalOrderStatus("REJECTED")).toBe(true);
    expect(isTerminalOrderStatus("CANCELLED")).toBe(true);
    expect(isTerminalOrderStatus("ORDER_PLACED")).toBe(false);
    expect(isTerminalOrderStatus("PENDING_APPROVAL")).toBe(false);
  });
});

describe("isFactoryHiddenOrder / canAccessOrder (P1 FACTORY hide)", () => {
  const factory = fakeProfile("FACTORY");
  const admin = fakeProfile("ADMIN");
  const staff = fakeProfile("STAFF");

  it("hides PENDING_APPROVAL and REJECTED from FACTORY even when rate-cleared", () => {
    expect(
      isFactoryHiddenOrder({
        currentStatus: "PENDING_APPROVAL",
        needsRateApproval: false,
      }),
    ).toBe(true);
    expect(
      isFactoryHiddenOrder({
        currentStatus: "REJECTED",
        needsRateApproval: false,
      }),
    ).toBe(true);
    expect(
      isFactoryHiddenOrder({
        currentStatus: "ORDER_PLACED",
        needsRateApproval: false,
      }),
    ).toBe(false);
  });

  it("FACTORY cannot access a pending or rejected order", () => {
    expect(
      canAccessOrder(factory, {
        salespersonId: staff.id,
        currentStatus: "PENDING_APPROVAL",
        needsRateApproval: false,
      }),
    ).toBe(false);
    expect(
      canAccessOrder(factory, {
        salespersonId: staff.id,
        currentStatus: "REJECTED",
        needsRateApproval: true,
      }),
    ).toBe(false);
    expect(
      canAccessOrder(factory, {
        salespersonId: staff.id,
        currentStatus: "ORDER_PLACED",
        needsRateApproval: false,
      }),
    ).toBe(true);
  });

  it("ADMIN can access pending orders; STAFF only their own", () => {
    expect(
      canAccessOrder(admin, {
        salespersonId: staff.id,
        currentStatus: "PENDING_APPROVAL",
      }),
    ).toBe(true);
    expect(
      canAccessOrder(staff, {
        salespersonId: staff.id,
        currentStatus: "PENDING_APPROVAL",
      }),
    ).toBe(true);
    expect(
      canAccessOrder(staff, {
        salespersonId: "someone-else",
        currentStatus: "PENDING_APPROVAL",
      }),
    ).toBe(false);
  });
});

describe("approveOrderAction / rejectOrderAction are ADMIN-gated", () => {
  it("both actions call requireAdmin before the RPC", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const src = readFileSync(
      resolve(__dirname, "..", "..", "app", "(dashboard)", "production", "actions.ts"),
      "utf8",
    );
    for (const name of ["approveOrderAction", "rejectOrderAction"]) {
      const fn = src.slice(src.indexOf(`export async function ${name}`));
      const body = fn.slice(0, fn.indexOf("\nexport async function", 1));
      expect(body, name).toMatch(/requireAdmin\s*\(/);
      const adminIdx = body.search(/requireAdmin\s*\(/);
      const rpcIdx = body.search(/\.rpc\(/);
      expect(adminIdx).toBeGreaterThanOrEqual(0);
      expect(rpcIdx).toBeGreaterThan(adminIdx);
    }
  });
});
