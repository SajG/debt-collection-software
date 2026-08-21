/**
 * Rule matrix for create_sales_order — the single unified write path
 * (P0-A). Runs against the real Supabase via three JWTs:
 *   - STAFF-owner (owns the party)
 *   - STAFF-other (different salesperson)
 *   - ADMIN
 *
 * Verifies:
 *   - below-floor + STAFF          → PENDING_APPROVAL, needsRateApproval=true
 *   - below-floor + ADMIN          → ORDER_PLACED, rate self-approved
 *   - over-limit + STAFF + NONE    → RPC raises credit-limit error
 *   - over-limit + STAFF + EXCEPTIONS_ONLY → PENDING_APPROVAL
 *   - over-limit + ADMIN, no note  → RPC raises override-note error
 *   - over-limit + ADMIN, w/ note  → order created,
 *                                    creditCheckPassed=false,
 *                                    creditOverrideById=admin,
 *                                    creditOverrideNote set
 *   - new-customer (no party)      → PENDING_APPROVAL, no credit check
 *   - mode ALL                     → even a routine order is PENDING_APPROVAL
 *   - STAFF touching not-their-party → assignment error
 *
 * Skips cleanly when service-role creds aren't in .env (same
 * runIf pattern as rls.staff-isolation.test.ts).
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

type Session = { userId: string; email: string; client: SupabaseClient };

async function makeUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<Session> {
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
  return { userId: data.user.id, email, client };
}

async function rpcCreate(
  session: SupabaseClient,
  partial: Record<string, unknown>,
) {
  return session.rpc("create_sales_order", {
    p_party_id: null,
    p_new_customer_name: null,
    p_dispatch_location: null,
    p_product_id: null,
    p_new_product_name: null,
    p_brand: null,
    p_quantity: 1,
    p_quantity_unit: "KG",
    p_packing_type: "Bag",
    p_size_kg: "25",
    p_product_rate: "100",
    p_payment_term: "NET_30",
    p_transport_type: "SELF_PICKUP",
    p_expected_delivery_date: null,
    p_token_type: null,
    p_notes: null,
    p_credit_override_note: null,
    ...partial,
  });
}

describe.runIf(required)("create_sales_order — rule matrix (P0-A)", () => {
  const stamp = Date.now();
  const password = `Rule_${stamp}!Aa1`;
  const emailOwner = `create-rules-owner-${stamp}@paytrack.test`;
  const emailOther = `create-rules-other-${stamp}@paytrack.test`;
  const emailAdmin = `create-rules-admin-${stamp}@paytrack.test`;

  let admin!: SupabaseClient;
  let db!: PrismaClient;
  let owner!: Session;
  let other!: Session;
  let adminSession!: Session;
  let partyId!: string;
  let productBelowFloorId!: string;
  let productWithinFloorId!: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    db = new PrismaClient();

    owner = await makeUser(admin, emailOwner, password);
    other = await makeUser(admin, emailOther, password);
    adminSession = await makeUser(admin, emailAdmin, password);

    // Profiles: OWNER = STAFF, OTHER = STAFF, ADMIN = ADMIN.
    // All active, all fresh so they don't hit any prior test's
    // rate-limit counter.
    await db.profile.createMany({
      data: [
        {
          id: owner.userId,
          businessName: "Test",
          ownerName: "Owner",
          phone: `9${stamp}`.slice(0, 10),
          role: "STAFF",
        },
        {
          id: other.userId,
          businessName: "Test",
          ownerName: "Other",
          phone: `8${stamp}`.slice(0, 10),
          role: "STAFF",
        },
        {
          id: adminSession.userId,
          businessName: "Test",
          ownerName: "Admin",
          phone: `7${stamp}`.slice(0, 10),
          role: "ADMIN",
        },
      ],
    });

    // Party owned by OWNER. Small credit limit + outstanding so a
    // ₹500-value order triggers the credit gate cleanly.
    const party = await db.party.create({
      data: {
        name: `RuleParty ${stamp}`,
        assignedToId: owner.userId,
        creditLimit: 1000,
        totalOutstanding: 800,
      },
    });
    partyId = party.id;

    const belowFloor = await db.product.create({
      data: {
        name: `Rule Below ${stamp}`,
        brand: "TestBrand",
        floorRate: 200, // rate 100 → below floor
        sortOrder: 9999,
      },
    });
    productBelowFloorId = belowFloor.id;

    const withinFloor = await db.product.create({
      data: {
        name: `Rule OK ${stamp}`,
        brand: "TestBrand",
        floorRate: 50, // rate 100 → above floor
        sortOrder: 9999,
      },
    });
    productWithinFloorId = withinFloor.id;

    // Housekeeping — orphan orders from earlier partial runs (this
    // test creates new-customer orders with partyId=null, which the
    // partyId-scoped cleanup below cannot reach). Delete anything
    // pointing at our fresh users; on a fresh DB this is a no-op.
    await db.salesOrder.deleteMany({
      where: {
        salespersonId: {
          in: [owner.userId, other.userId, adminSession.userId],
        },
      },
    });

    await setApprovalMode("EXCEPTIONS_ONLY");
  }, 60_000);

  afterAll(async () => {
    // Best-effort tear-down. Cascade delete via Profile FK cleans
    // the orders too.
    try {
      // Clean every order this run created — partyId cleanup misses
      // new-customer orders (partyId=null) so scope by salesperson.
      await db.salesOrder.deleteMany({
        where: {
          salespersonId: {
            in: [owner.userId, other.userId, adminSession.userId],
          },
        },
      });
      await db.party.delete({ where: { id: partyId } });
      await db.product.deleteMany({
        where: { id: { in: [productBelowFloorId, productWithinFloorId] } },
      });
      for (const id of [owner.userId, other.userId, adminSession.userId]) {
        await db.profile.deleteMany({ where: { id } });
        await admin.auth.admin.deleteUser(id).catch(() => undefined);
      }
    } finally {
      await db.$disconnect();
    }
  }, 60_000);

  it("below-floor + STAFF → order created with needsRateApproval=true", async () => {
    const { data, error } = await rpcCreate(owner.client, {
      p_party_id: partyId,
      p_product_id: productBelowFloorId,
      p_quantity: 1,
      p_product_rate: "100",
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const orderId = (Array.isArray(data) ? data[0] : data)?.id as string;
    expect(orderId).toBeTruthy();
    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    expect(order?.needsRateApproval).toBe(true);
    expect(order?.currentStatus).toBe("PENDING_APPROVAL");
    expect(order?.creditCheckPassed).toBe(true); // ₹100 < ₹200 headroom
  });

  it("below-floor + ADMIN → ORDER_PLACED, rate self-approved at placement", async () => {
    // Admin placing on an admin-owned or unassigned party. Move the
    // party's assignee to the admin to avoid the assignment gate.
    await db.party.update({
      where: { id: partyId },
      data: { assignedToId: adminSession.userId },
    });
    const { data, error } = await rpcCreate(adminSession.client, {
      p_party_id: partyId,
      p_product_id: productBelowFloorId,
      p_quantity: 1,
      p_product_rate: "100",
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const orderId = (Array.isArray(data) ? data[0] : data)?.id as string;
    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    expect(order?.currentStatus).toBe("ORDER_PLACED");
    expect(order?.needsRateApproval).toBe(false);
    expect(order?.rateApprovedById).toBe(adminSession.userId);
    // Restore for later cases
    await db.party.update({
      where: { id: partyId },
      data: { assignedToId: owner.userId },
    });
  });

  async function setApprovalMode(mode: "NONE" | "EXCEPTIONS_ONLY" | "ALL") {
    const rows = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "BusinessSettings"`,
    );
    if (rows.length === 0) {
      await db.businessSettings.create({
        data: {
          profileId: adminSession.userId,
          orderApprovalMode: mode,
        },
      });
    } else {
      await db.$executeRawUnsafe(
        `UPDATE "BusinessSettings" SET "orderApprovalMode" = $1::"OrderApprovalMode"`,
        mode,
      );
    }
  }

  it("over-limit + STAFF under mode NONE → RPC raises credit-limit error", async () => {
    await setApprovalMode("NONE");
    try {
      const { error } = await rpcCreate(owner.client, {
        p_party_id: partyId,
        p_product_id: productWithinFloorId,
        p_quantity: 10, // 10 * ₹100 = 1000; outstanding 800 → projected 1800 > 1000
        p_product_rate: "100",
      });
      expect(error?.message ?? "").toMatch(/credit limit would be exceeded/i);
    } finally {
      await setApprovalMode("EXCEPTIONS_ONLY");
    }
  });

  it("over-limit + STAFF under mode EXCEPTIONS_ONLY → order lands in PENDING_APPROVAL", async () => {
    // Default mode. STAFF over-limit no longer raises; the order is
    // written with creditCheckPassed=false and routed to the admin
    // approval queue.
    await setApprovalMode("EXCEPTIONS_ONLY");
    const { data, error } = await rpcCreate(owner.client, {
      p_party_id: partyId,
      p_product_id: productWithinFloorId,
      p_quantity: 10,
      p_product_rate: "100",
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const orderId = (Array.isArray(data) ? data[0] : data)?.id as string;
    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    expect(order?.currentStatus).toBe("PENDING_APPROVAL");
    expect(order?.creditCheckPassed).toBe(false);
  });

  it("over-limit + ADMIN, no override note → RPC raises note-required error", async () => {
    await db.party.update({
      where: { id: partyId },
      data: { assignedToId: adminSession.userId },
    });
    const { error } = await rpcCreate(adminSession.client, {
      p_party_id: partyId,
      p_product_id: productWithinFloorId,
      p_quantity: 10,
      p_product_rate: "100",
    });
    expect(error?.message ?? "").toMatch(/override note required/i);
    await db.party.update({
      where: { id: partyId },
      data: { assignedToId: owner.userId },
    });
  });

  it("over-limit + ADMIN, override note → order created with override stamps", async () => {
    await db.party.update({
      where: { id: partyId },
      data: { assignedToId: adminSession.userId },
    });
    const noteText = "Director-approved past limit";
    const { data, error } = await rpcCreate(adminSession.client, {
      p_party_id: partyId,
      p_product_id: productWithinFloorId,
      p_quantity: 10,
      p_product_rate: "100",
      p_credit_override_note: noteText,
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const orderId = (Array.isArray(data) ? data[0] : data)?.id as string;
    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    expect(order?.creditCheckPassed).toBe(false);
    expect(order?.creditOverrideById).toBe(adminSession.userId);
    expect(order?.creditOverrideNote).toBe(noteText);
    await db.party.update({
      where: { id: partyId },
      data: { assignedToId: owner.userId },
    });
  });

  it("new-customer (no party) → no credit check runs even at high value", async () => {
    const { data, error } = await rpcCreate(owner.client, {
      p_party_id: null,
      p_new_customer_name: `RuleNewCust ${stamp}`,
      p_product_id: productWithinFloorId,
      p_quantity: 10_000, // huge; would trip any limit
      p_product_rate: "100",
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const orderId = (Array.isArray(data) ? data[0] : data)?.id as string;
    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    expect(order?.creditCheckPassed).toBe(true);
    expect(order?.creditOverrideById).toBeNull();
    expect(order?.newCustomerName).toBe(`RuleNewCust ${stamp}`);
    expect(order?.partyId).toBeNull();
    expect(order?.currentStatus).toBe("PENDING_APPROVAL");
  });

  it("mode ALL → even a routine in-limit order lands in PENDING_APPROVAL", async () => {
    await setApprovalMode("ALL");
    try {
      const { data, error } = await rpcCreate(owner.client, {
        p_party_id: partyId,
        p_product_id: productWithinFloorId,
        p_quantity: 1,
        p_product_rate: "100",
      });
      expect(error, JSON.stringify(error)).toBeNull();
      const orderId = (Array.isArray(data) ? data[0] : data)?.id as string;
      const order = await db.salesOrder.findUnique({ where: { id: orderId } });
      expect(order?.currentStatus).toBe("PENDING_APPROVAL");
      expect(order?.needsRateApproval).toBe(false);
      expect(order?.creditCheckPassed).toBe(true);
    } finally {
      await setApprovalMode("EXCEPTIONS_ONLY");
    }
  });

  it("P0-B regression — dispatchLocation, tokenType, and seed event notes are all preserved", async () => {
    // The old web retry branch (deleted by P0-A) silently dropped
    // these fields on any orderNumber P2002 collision. The RPC now
    // has no retry branch — advisory lock + MAX(seq)+1 prevents
    // collision — so we just assert the single write path keeps
    // every field the client sent.
    const dispatch = `Godown 4, Pune — test ${stamp}`;
    const token = "With Synergy Barcode Token";
    const { data, error } = await rpcCreate(owner.client, {
      p_party_id: partyId,
      p_product_id: productWithinFloorId,
      p_quantity: 1,
      p_product_rate: "100",
      p_dispatch_location: dispatch,
      p_token_type: token,
      p_notes: "Ship urgently",
    });
    expect(error, JSON.stringify(error)).toBeNull();
    const orderId = (Array.isArray(data) ? data[0] : data)?.id as string;
    const order = await db.salesOrder.findUnique({
      where: { id: orderId },
      include: { statusEvents: true },
    });
    expect(order?.dispatchLocation).toBe(dispatch);
    expect(order?.tokenType).toBe(token);
    expect(order?.notes).toBe("Ship urgently");
    // The seed OrderStatusEvent should also carry the "Order placed"
    // note — the old retry branch dropped it.
    expect(order?.statusEvents.length).toBe(1);
    expect(order?.statusEvents[0].notes).toContain("Order placed");
  });

  it("P0-B regression — createSalesOrderAction has no P2002 retry branch", async () => {
    // Static assertion — if a future refactor re-introduces a retry
    // path on the web that duplicates the create block, this test
    // fails loudly. Guards against the "two blocks drift" bug class.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "..", "..", "app", "(dashboard)", "orders", "actions.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/P2002/);
    expect(src).not.toMatch(/salesOrder\.create/);
    expect(src).not.toMatch(/\bretry\b/i);
  });

  it("STAFF touching not-their-party → assignment error", async () => {
    // OTHER is a different salesperson; the party is assigned to OWNER.
    const { error } = await rpcCreate(other.client, {
      p_party_id: partyId,
      p_product_id: productWithinFloorId,
      p_quantity: 1,
      p_product_rate: "100",
    });
    expect(error?.message ?? "").toMatch(/assigned to another salesperson/i);
  });
});
