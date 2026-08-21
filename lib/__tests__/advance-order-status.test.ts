/**
 * P0-D — advance_order_status RPC.
 * Asserts atomicity + transition validation against real Supabase.
 *
 * Rules exercised (mirrors ORDER_STATUS_SEQUENCE in lib/orders/status.ts):
 *   - ORDER_PLACED → IN_PRODUCTION → READY_TO_DISPATCH → LR_GENERATED
 *     → DISPATCHED → DELIVERED    (linear forward, allowed)
 *   - jump ORDER_PLACED → DISPATCHED (skip)   → rejected
 *   - jump IN_PRODUCTION → ORDER_PLACED (back) → rejected
 *   - cancel from ORDER_PLACED                → allowed
 *   - cancel from DELIVERED                   → rejected
 *   - needsRateApproval=true order            → rejected
 *   - STAFF role                              → rejected
 *   - deliveredAt stamped on the DELIVERED edge
 *   - failed transition leaves ZERO OrderStatusEvent rows appended
 *     (atomicity — either both writes or neither)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function loadDotEnv(filePath = resolve(process.cwd(), ".env")) {
  if (!existsSync(filePath)) return;
  for (const raw of readFileSync(filePath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const required = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

async function makeUser(admin: SupabaseClient, email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn ${email}: ${signIn.error.message}`);
  return { userId: data.user.id, client };
}

describe.runIf(required)("advance_order_status — transition + atomicity", () => {
  const stamp = Date.now();
  const password = `Adv_${stamp}!Aa1`;
  const emailFactory = `adv-factory-${stamp}@synworks.test`;
  const emailStaff = `adv-staff-${stamp}@synworks.test`;

  let admin!: SupabaseClient;
  let db!: PrismaClient;
  let factory!: { userId: string; client: SupabaseClient };
  let staff!: { userId: string; client: SupabaseClient };
  let partyId!: string;
  let productId!: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    db = new PrismaClient();

    factory = await makeUser(admin, emailFactory, password);
    staff = await makeUser(admin, emailStaff, password);

    await db.profile.createMany({
      data: [
        {
          id: factory.userId,
          businessName: "Test",
          ownerName: "AdvFactory",
          phone: `9${stamp}`.slice(0, 10),
          role: "FACTORY",
        },
        {
          id: staff.userId,
          businessName: "Test",
          ownerName: "AdvStaff",
          phone: `8${stamp}`.slice(0, 10),
          role: "STAFF",
        },
      ],
    });

    const p = await db.party.create({
      data: { name: `AdvParty ${stamp}`, assignedToId: staff.userId },
    });
    partyId = p.id;

    const prod = await db.product.create({
      data: { name: `AdvProd ${stamp}`, brand: "TestBrand", sortOrder: 9999 },
    });
    productId = prod.id;
  }, 60_000);

  afterAll(async () => {
    try {
      await db.salesOrder.deleteMany({
        where: {
          salespersonId: { in: [staff.userId, factory.userId] },
        },
      });
      await db.party.deleteMany({ where: { id: partyId } });
      await db.product.deleteMany({ where: { id: productId } });
      for (const id of [factory.userId, staff.userId]) {
        await db.profile.deleteMany({ where: { id } });
        await admin.auth.admin.deleteUser(id).catch(() => undefined);
      }
    } finally {
      await db.$disconnect();
    }
  }, 60_000);

  async function makeOrder(
    currentStatus:
      | "ORDER_PLACED"
      | "IN_PRODUCTION"
      | "READY_TO_DISPATCH"
      | "LR_GENERATED"
      | "DISPATCHED"
      | "DELIVERED"
      | "CANCELLED",
    opts: { needsRateApproval?: boolean } = {},
  ): Promise<string> {
    const created = await db.salesOrder.create({
      data: {
        orderNumber: `ADVTEST/${stamp}/${Math.random().toString(36).slice(2, 8)}`,
        partyId,
        salespersonId: staff.userId,
        productId,
        brand: "TestBrand",
        quantity: 1,
        quantityUnit: "KG",
        packingType: "Bag",
        sizeKg: "25",
        productRate: "100",
        orderValue: 100,
        paymentTerm: "NET_30",
        transportType: "SELF_PICKUP",
        currentStatus,
        needsRateApproval: opts.needsRateApproval ?? false,
      },
    });
    return created.id;
  }

  async function eventCount(orderId: string): Promise<number> {
    return db.orderStatusEvent.count({ where: { salesOrderId: orderId } });
  }

  it("linear forward chain succeeds and each step appends exactly one event", async () => {
    const orderId = await makeOrder("ORDER_PLACED");
    const chain: Array<
      "IN_PRODUCTION" | "READY_TO_DISPATCH" | "LR_GENERATED" | "DISPATCHED" | "DELIVERED"
    > = [
      "IN_PRODUCTION",
      "READY_TO_DISPATCH",
      "LR_GENERATED",
      "DISPATCHED",
      "DELIVERED",
    ];
    for (const target of chain) {
      const { error } = await factory.client.rpc("advance_order_status", {
        p_order_id: orderId,
        p_target: target,
        p_note: `→ ${target}`,
      });
      expect(error, `${target}: ${JSON.stringify(error)}`).toBeNull();
    }
    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    expect(order?.currentStatus).toBe("DELIVERED");
    expect(order?.deliveredAt).toBeInstanceOf(Date);
    expect(await eventCount(orderId)).toBe(chain.length);
  });

  it("skip transition (ORDER_PLACED → DISPATCHED) is rejected and no event is written", async () => {
    const orderId = await makeOrder("ORDER_PLACED");
    const before = await eventCount(orderId);
    const { error } = await factory.client.rpc("advance_order_status", {
      p_order_id: orderId,
      p_target: "DISPATCHED",
      p_note: "should-not-work",
    });
    expect(error?.message ?? "").toMatch(/cannot advance/i);
    expect(await eventCount(orderId)).toBe(before);
    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    expect(order?.currentStatus).toBe("ORDER_PLACED");
  });

  it("backwards transition (IN_PRODUCTION → ORDER_PLACED) is rejected atomically", async () => {
    const orderId = await makeOrder("IN_PRODUCTION");
    const before = await eventCount(orderId);
    const { error } = await factory.client.rpc("advance_order_status", {
      p_order_id: orderId,
      p_target: "ORDER_PLACED",
      p_note: "should-not-work",
    });
    expect(error?.message ?? "").toMatch(/cannot advance/i);
    expect(await eventCount(orderId)).toBe(before);
  });

  it("cancel from ORDER_PLACED is allowed", async () => {
    const orderId = await makeOrder("ORDER_PLACED");
    const { error } = await factory.client.rpc("advance_order_status", {
      p_order_id: orderId,
      p_target: "CANCELLED",
      p_note: "test cancel",
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    expect(order?.currentStatus).toBe("CANCELLED");
  });

  it("cancel from DELIVERED is rejected", async () => {
    const orderId = await makeOrder("DELIVERED");
    const { error } = await factory.client.rpc("advance_order_status", {
      p_order_id: orderId,
      p_target: "CANCELLED",
      p_note: "should-not-work",
    });
    expect(error?.message ?? "").toMatch(/cannot cancel/i);
  });

  it("needsRateApproval=true → rejected before any write", async () => {
    const orderId = await makeOrder("ORDER_PLACED", { needsRateApproval: true });
    const before = await eventCount(orderId);
    const { error } = await factory.client.rpc("advance_order_status", {
      p_order_id: orderId,
      p_target: "IN_PRODUCTION",
      p_note: "blocked",
    });
    expect(error?.message ?? "").toMatch(/awaiting admin rate approval/i);
    expect(await eventCount(orderId)).toBe(before);
  });

  it("STAFF caller is rejected", async () => {
    const orderId = await makeOrder("ORDER_PLACED");
    const { error } = await staff.client.rpc("advance_order_status", {
      p_order_id: orderId,
      p_target: "IN_PRODUCTION",
      p_note: "should-not-work",
    });
    expect(error?.message ?? "").toMatch(/only FACTORY or ADMIN/i);
  });
});
