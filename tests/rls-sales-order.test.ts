/**
 * Integration test: verifies SalesOrder RLS enforces per-salesperson isolation
 * against a real Supabase instance. This is the whole point of the RLS chunk —
 * if you delete this, we lose the only proof that the mobile app can't scrape
 * other salespeople's orders.
 *
 * PREREQUISITES
 *   - supabase/migrations/20260807000000_add_rls_policies.sql has been applied
 *     (run `npm run db:rls`).
 *   - The following env vars must be set (loaded from .env / .env.local):
 *       SUPABASE_URL                 (or NEXT_PUBLIC_SUPABASE_URL)
 *       SUPABASE_ANON_KEY            (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 *       SUPABASE_SERVICE_ROLE_KEY    (only present on trusted machines)
 *   - Point them at a DEV project, not production. The test creates and then
 *     deletes two auth users, one Party, one Product, and two SalesOrders,
 *     all prefixed `rls-` for easy manual cleanup if a run crashes mid-way.
 *
 * If any of the vars are missing, the suite is skipped with a loud message
 * instead of silently passing.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const canRun = Boolean(url && anonKey && serviceKey);

if (!canRun) {
  // eslint-disable-next-line no-console
  console.warn(
    "[rls-sales-order] SKIPPED — set SUPABASE_URL, SUPABASE_ANON_KEY, and " +
      "SUPABASE_SERVICE_ROLE_KEY (dev project only) to run this test.",
  );
}

const suite = canRun ? describe : describe.skip;

type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

type Ctx = {
  admin: SupabaseClient;
  userA: TestUser;
  userB: TestUser;
  productId: string;
  partyId: string;
  orderA: { id: string; orderNumber: string };
  orderB: { id: string; orderNumber: string };
};

const nowIso = () => new Date().toISOString();
const uniq = () => randomUUID().replace(/-/g, "").slice(0, 10);

async function createTestUser(
  admin: SupabaseClient,
  label: string,
): Promise<TestUser> {
  const email = `rls-${label}-${uniq()}@paytrack.test`;
  const password = `RlsTest!${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser(${label}) failed: ${error?.message}`);
  }
  const userId = data.user.id;

  const now = nowIso();
  const { error: profErr } = await admin.from("Profile").insert({
    id: userId,
    businessName: `RLS Test ${label}`,
    ownerName: label,
    role: "STAFF",
    createdAt: now,
    updatedAt: now,
  });
  if (profErr) {
    throw new Error(`Profile insert(${label}) failed: ${profErr.message}`);
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    throw new Error(`signIn(${label}) failed: ${signInErr.message}`);
  }

  return { id: userId, email, password, client };
}

suite("RLS: SalesOrder cross-user isolation", () => {
  let ctx: Ctx;

  beforeAll(async () => {
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Product — SalesOrder.productId is a required FK.
    const productId = randomUUID();
    {
      const { error } = await admin.from("Product").insert({
        id: productId,
        name: `rls-test-product-${uniq()}`,
        brand: null,
        sortOrder: 0,
        isActive: true,
      });
      if (error) throw new Error(`Product insert failed: ${error.message}`);
    }

    const userA = await createTestUser(admin, "a");
    const userB = await createTestUser(admin, "b");

    // Unassigned Party — the party-scope rule lets both STAFF users see it,
    // isolating the test purely to SalesOrder's salespersonId check.
    const partyId = randomUUID();
    {
      const now = nowIso();
      const { error } = await admin.from("Party").insert({
        id: partyId,
        name: `RLS Test Party ${uniq()}`,
        assignedToId: null,
        createdAt: now,
        updatedAt: now,
      });
      if (error) throw new Error(`Party insert failed: ${error.message}`);
    }

    const mkOrder = async (salespersonId: string, tag: string) => {
      const id = randomUUID();
      const orderNumber = `RLS/TEST/${tag}-${uniq()}`;
      const now = nowIso();
      const { error } = await admin.from("SalesOrder").insert({
        id,
        orderNumber,
        partyId,
        salespersonId,
        productId,
        brand: null,
        quantity: "10",
        quantityUnit: "KG",
        packingType: "drum",
        sizeKg: "20",
        productRate: "100",
        paymentTerm: "IMMEDIATE",
        transportType: "DOOR",
        currentStatus: "ORDER_PLACED",
        createdAt: now,
        updatedAt: now,
      });
      if (error) {
        throw new Error(`SalesOrder insert(${tag}) failed: ${error.message}`);
      }
      return { id, orderNumber };
    };
    const orderA = await mkOrder(userA.id, "A");
    const orderB = await mkOrder(userB.id, "B");

    ctx = { admin, userA, userB, productId, partyId, orderA, orderB };
  });

  afterAll(async () => {
    if (!ctx) return;
    const { admin, userA, userB, partyId, productId, orderA, orderB } = ctx;
    // FK-safe order.
    await admin
      .from("OrderStatusEvent")
      .delete()
      .in("salesOrderId", [orderA.id, orderB.id]);
    await admin.from("SalesOrder").delete().in("id", [orderA.id, orderB.id]);
    await admin.from("Party").delete().eq("id", partyId);
    await admin.from("Product").delete().eq("id", productId);
    await admin.from("Profile").delete().in("id", [userA.id, userB.id]);
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  });

  it("User A listing SalesOrders returns own row, hides User B's", async () => {
    const { data, error } = await ctx.userA.client
      .from("SalesOrder")
      .select("id, orderNumber, salespersonId")
      .in("id", [ctx.orderA.id, ctx.orderB.id]);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const ids = (data ?? []).map((r) => r.id as string);
    expect(ids).toContain(ctx.orderA.id);
    expect(ids).not.toContain(ctx.orderB.id);
  });

  it("User A fetching User B's SalesOrder by primary key returns null", async () => {
    const { data, error } = await ctx.userA.client
      .from("SalesOrder")
      .select("id")
      .eq("id", ctx.orderB.id)
      .maybeSingle();

    // RLS filters to zero rows — PostgREST returns null data, no error.
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("User B fetching User A's SalesOrder by primary key returns null", async () => {
    const { data, error } = await ctx.userB.client
      .from("SalesOrder")
      .select("id")
      .eq("id", ctx.orderA.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("User A cannot INSERT a SalesOrder impersonating User B", async () => {
    const { data, error } = await ctx.userA.client
      .from("SalesOrder")
      .insert({
        id: randomUUID(),
        orderNumber: `RLS/TEST/SPOOF-${uniq()}`,
        partyId: ctx.partyId,
        salespersonId: ctx.userB.id, // spoofed
        productId: ctx.productId,
        brand: null,
        quantity: "1",
        quantityUnit: "KG",
        packingType: "drum",
        sizeKg: "1",
        productRate: "1",
        paymentTerm: "IMMEDIATE",
        transportType: "DOOR",
        currentStatus: "ORDER_PLACED",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      .select();

    // The WITH CHECK expression on sales_order_staff_insert_own must fail.
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("User A can INSERT a SalesOrder with own salespersonId", async () => {
    const id = randomUUID();
    const orderNumber = `RLS/TEST/OWN-${uniq()}`;
    const { data, error } = await ctx.userA.client
      .from("SalesOrder")
      .insert({
        id,
        orderNumber,
        partyId: ctx.partyId,
        salespersonId: ctx.userA.id,
        productId: ctx.productId,
        brand: null,
        quantity: "1",
        quantityUnit: "KG",
        packingType: "drum",
        sizeKg: "1",
        productRate: "1",
        paymentTerm: "IMMEDIATE",
        transportType: "DOOR",
        currentStatus: "ORDER_PLACED",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      .select();

    expect(error).toBeNull();
    expect(data?.[0]?.id).toBe(id);

    // Cleanup this extra row so afterAll's fixed delete-list stays accurate.
    await ctx.admin.from("SalesOrder").delete().eq("id", id);
  });
});
