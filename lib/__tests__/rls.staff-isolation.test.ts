/**
 * Real RLS integration test — talks to Supabase PostgREST as two STAFF JWTs.
 * Fixture setup uses Prisma + the Auth Admin API (service role / DB owner
 * bypass RLS). Assertions use the anon key + user sessions so they exercise
 * actual policies, not application-level partyScopeWhere.
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

type Fixture = {
  userAId: string;
  userBId: string;
  emailA: string;
  emailB: string;
  password: string;
  partyAId: string;
  partyBId: string;
  invoiceAId: string;
  invoiceBId: string;
  orderAId: string;
  orderBId: string;
};

describe.runIf(required)("RLS — STAFF isolation via direct Supabase client", () => {
  const password = `RlsTest_${Date.now()}!Aa1`;
  const stamp = Date.now();
  const emailA = `rls-staff-a-${stamp}@synworks.test`;
  const emailB = `rls-staff-b-${stamp}@synworks.test`;

  let admin: SupabaseClient;
  let db: PrismaClient;
  let fixture: Fixture;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    db = new PrismaClient();

    const createdA = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (createdA.error || !createdA.data.user) {
      throw new Error(`createUser A: ${createdA.error?.message}`);
    }

    const createdB = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (createdB.error || !createdB.data.user) {
      throw new Error(`createUser B: ${createdB.error?.message}`);
    }

    const userAId = createdA.data.user.id;
    const userBId = createdB.data.user.id;

    await db.profile.createMany({
      data: [
        {
          id: userAId,
          businessName: "RLS Test Co",
          ownerName: "Staff A",
          role: "STAFF",
          costCentreName: "RLS-A",
        },
        {
          id: userBId,
          businessName: "RLS Test Co",
          ownerName: "Staff B",
          role: "STAFF",
          costCentreName: "RLS-B",
        },
      ],
    });

    const partyA = await db.party.create({
      data: {
        name: `RLS Party A ${stamp}`,
        assignedToId: userAId,
        costCentre: "RLS-A",
      },
    });
    const partyB = await db.party.create({
      data: {
        name: `RLS Party B ${stamp}`,
        assignedToId: userBId,
        costCentre: "RLS-B",
      },
    });

    const due = new Date();
    due.setDate(due.getDate() + 30);
    const invoiceA = await db.invoice.create({
      data: {
        invoiceNumber: `RLS-A-${stamp}`,
        partyId: partyA.id,
        invoiceDate: new Date(),
        dueDate: due,
        totalAmount: 1000,
        status: "UNPAID",
        source: "MANUAL",
      },
    });
    const invoiceB = await db.invoice.create({
      data: {
        invoiceNumber: `RLS-B-${stamp}`,
        partyId: partyB.id,
        invoiceDate: new Date(),
        dueDate: due,
        totalAmount: 2000,
        status: "UNPAID",
        source: "MANUAL",
      },
    });

    const product = await db.product.findFirst({ where: { isActive: true } });
    if (!product) throw new Error("Need at least one Product seeded");

    const orderA = await db.salesOrder.create({
      data: {
        orderNumber: `SB/RLS/${stamp}-A`,
        partyId: partyA.id,
        salespersonId: userAId,
        productId: product.id,
        brand: product.brand,
        quantity: 10,
        quantityUnit: "PCS",
        productRate: "100",
        orderValue: 1000,
        currentStatus: "ORDER_PLACED",
      },
    });
    const orderB = await db.salesOrder.create({
      data: {
        orderNumber: `SB/RLS/${stamp}-B`,
        partyId: partyB.id,
        salespersonId: userBId,
        productId: product.id,
        brand: product.brand,
        quantity: 5,
        quantityUnit: "PCS",
        productRate: "200",
        orderValue: 1000,
        currentStatus: "ORDER_PLACED",
      },
    });

    fixture = {
      userAId,
      userBId,
      emailA,
      emailB,
      password,
      partyAId: partyA.id,
      partyBId: partyB.id,
      invoiceAId: invoiceA.id,
      invoiceBId: invoiceB.id,
      orderAId: orderA.id,
      orderBId: orderB.id,
    };
  }, 60_000);

  afterAll(async () => {
    if (!fixture) {
      await db?.$disconnect();
      return;
    }

    await db.salesOrder.deleteMany({
      where: { id: { in: [fixture.orderAId, fixture.orderBId] } },
    });
    await db.invoice.deleteMany({
      where: { id: { in: [fixture.invoiceAId, fixture.invoiceBId] } },
    });
    await db.party.deleteMany({
      where: { id: { in: [fixture.partyAId, fixture.partyBId] } },
    });
    await db.profile.deleteMany({
      where: { id: { in: [fixture.userAId, fixture.userBId] } },
    });
    await db.$disconnect();

    await admin.auth.admin.deleteUser(fixture.userAId);
    await admin.auth.admin.deleteUser(fixture.userBId);
  }, 60_000);

  async function clientAs(email: string): Promise<SupabaseClient> {
    const client = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email,
      password: fixture.password,
    });
    if (error) throw new Error(`signIn ${email}: ${error.message}`);
    return client;
  }

  it("STAFF A can read own party / invoice / order but not STAFF B's", async () => {
    const client = await clientAs(fixture.emailA);

    const { data: parties, error: partyErr } = await client
      .from("Party")
      .select("id")
      .in("id", [fixture.partyAId, fixture.partyBId]);
    expect(partyErr).toBeNull();
    expect(parties?.map((p) => p.id).sort()).toEqual([fixture.partyAId].sort());
    expect(parties?.some((p) => p.id === fixture.partyBId)).toBe(false);

    const { data: invoices, error: invErr } = await client
      .from("Invoice")
      .select("id")
      .in("id", [fixture.invoiceAId, fixture.invoiceBId]);
    expect(invErr).toBeNull();
    expect(invoices?.map((i) => i.id).sort()).toEqual([fixture.invoiceAId].sort());
    expect(invoices?.some((i) => i.id === fixture.invoiceBId)).toBe(false);

    const { data: orders, error: orderErr } = await client
      .from("SalesOrder")
      .select("id")
      .in("id", [fixture.orderAId, fixture.orderBId]);
    expect(orderErr).toBeNull();
    expect(orders?.map((o) => o.id).sort()).toEqual([fixture.orderAId].sort());
    expect(orders?.some((o) => o.id === fixture.orderBId)).toBe(false);

    // Direct fetch of B's rows must return empty (RLS filters), not the foreign row
    const { data: foreignParty } = await client
      .from("Party")
      .select("id")
      .eq("id", fixture.partyBId)
      .maybeSingle();
    expect(foreignParty).toBeNull();

    const { data: foreignInvoice } = await client
      .from("Invoice")
      .select("id")
      .eq("id", fixture.invoiceBId)
      .maybeSingle();
    expect(foreignInvoice).toBeNull();

    const { data: foreignOrder } = await client
      .from("SalesOrder")
      .select("id")
      .eq("id", fixture.orderBId)
      .maybeSingle();
    expect(foreignOrder).toBeNull();
  });

  it("STAFF B cannot read STAFF A's parties, invoices, or sales orders", async () => {
    const client = await clientAs(fixture.emailB);

    const { data: parties } = await client
      .from("Party")
      .select("id")
      .in("id", [fixture.partyAId, fixture.partyBId]);
    expect(parties?.map((p) => p.id).sort()).toEqual([fixture.partyBId].sort());

    const { data: invoices } = await client
      .from("Invoice")
      .select("id")
      .in("id", [fixture.invoiceAId, fixture.invoiceBId]);
    expect(invoices?.map((i) => i.id).sort()).toEqual([fixture.invoiceBId].sort());

    const { data: orders } = await client
      .from("SalesOrder")
      .select("id")
      .in("id", [fixture.orderAId, fixture.orderBId]);
    expect(orders?.map((o) => o.id).sort()).toEqual([fixture.orderBId].sort());
  });
});
