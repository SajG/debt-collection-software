/**
 * P0-C — the F6 rate-approval gate must live at the DB, not in one
 * page component. Talks to Supabase PostgREST as a FACTORY JWT and
 * asserts:
 *
 *   - Approval-pending orders (needsRateApproval=true) are INVISIBLE
 *     to FACTORY via .select — RLS sales_order_select_factory hides
 *     them by row rather than by column.
 *   - Cleared orders (needsRateApproval=false) ARE visible to
 *     FACTORY.
 *   - Any attempt to UPDATE a still-pending order by targeting its
 *     id returns zero-affected-rows (RLS filter denies) OR the
 *     BEFORE UPDATE trigger raises. Either failure mode is
 *     acceptable — both prove the write path is blocked.
 *
 * Fixture setup uses Prisma + Auth Admin API (both bypass RLS); the
 * assertions use the anon key + a FACTORY user session so they
 * exercise real policies. Mirrors rls.staff-isolation.test.ts.
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

describe.runIf(required)(
  "RLS — FACTORY cannot see or write needsRateApproval orders (P0-C)",
  () => {
    const stamp = Date.now();
    const password = `Rate_${stamp}!Aa1`;
    const emailFactory = `rate-factory-${stamp}@synworks.test`;
    const emailOwner = `rate-owner-${stamp}@synworks.test`;

    let admin!: SupabaseClient;
    let factory!: SupabaseClient;
    let db!: PrismaClient;
    let factoryUserId!: string;
    let ownerUserId!: string;
    let partyId!: string;
    let productId!: string;
    let pendingOrderId!: string;
    let clearedOrderId!: string;
    let pendingApprovalOrderId!: string;

    beforeAll(async () => {
      admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      db = new PrismaClient();

      const factoryCreate = await admin.auth.admin.createUser({
        email: emailFactory,
        password,
        email_confirm: true,
      });
      if (factoryCreate.error || !factoryCreate.data.user) {
        throw new Error(`createUser factory: ${factoryCreate.error?.message}`);
      }
      factoryUserId = factoryCreate.data.user.id;

      const ownerCreate = await admin.auth.admin.createUser({
        email: emailOwner,
        password,
        email_confirm: true,
      });
      if (ownerCreate.error || !ownerCreate.data.user) {
        throw new Error(`createUser owner: ${ownerCreate.error?.message}`);
      }
      ownerUserId = ownerCreate.data.user.id;

      await db.profile.createMany({
        data: [
          {
            id: factoryUserId,
            businessName: "Test",
            ownerName: "Factory",
            phone: `9${stamp}`.slice(0, 10),
            role: "FACTORY",
          },
          {
            id: ownerUserId,
            businessName: "Test",
            ownerName: "Owner",
            phone: `8${stamp}`.slice(0, 10),
            role: "STAFF",
          },
        ],
      });

      const party = await db.party.create({
        data: {
          name: `RatePolicy ${stamp}`,
          assignedToId: ownerUserId,
        },
      });
      partyId = party.id;

      const product = await db.product.create({
        data: {
          name: `RatePolicy Prod ${stamp}`,
          brand: "TestBrand",
          floorRate: 200,
          sortOrder: 9999,
        },
      });
      productId = product.id;

      // Two orders written directly via Prisma so we control the
      // needsRateApproval flag independently of the RPC path.
      const pending = await db.salesOrder.create({
        data: {
          orderNumber: `RATETEST/${stamp}/1`,
          partyId,
          salespersonId: ownerUserId,
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
          needsRateApproval: true,
        },
      });
      pendingOrderId = pending.id;

      const pendingApproval = await db.salesOrder.create({
        data: {
          orderNumber: `RATETEST/${stamp}/3`,
          partyId,
          salespersonId: ownerUserId,
          productId,
          brand: "TestBrand",
          quantity: 1,
          quantityUnit: "KG",
          packingType: "Bag",
          sizeKg: "25",
          productRate: "300",
          orderValue: 300,
          paymentTerm: "NET_30",
          transportType: "SELF_PICKUP",
          needsRateApproval: false,
          currentStatus: "PENDING_APPROVAL",
        },
      });
      pendingApprovalOrderId = pendingApproval.id;

      const cleared = await db.salesOrder.create({
        data: {
          orderNumber: `RATETEST/${stamp}/2`,
          partyId,
          salespersonId: ownerUserId,
          productId,
          brand: "TestBrand",
          quantity: 1,
          quantityUnit: "KG",
          packingType: "Bag",
          sizeKg: "25",
          productRate: "300",
          orderValue: 300,
          paymentTerm: "NET_30",
          transportType: "SELF_PICKUP",
          needsRateApproval: false,
        },
      });
      clearedOrderId = cleared.id;

      factory = createClient(SUPABASE_URL!, ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signIn = await factory.auth.signInWithPassword({
        email: emailFactory,
        password,
      });
      if (signIn.error) {
        throw new Error(`factory signIn: ${signIn.error.message}`);
      }
    }, 60_000);

    afterAll(async () => {
      try {
        await db.salesOrder.deleteMany({
          where: {
            id: { in: [pendingOrderId, clearedOrderId, pendingApprovalOrderId] },
          },
        });
        await db.party.deleteMany({ where: { id: partyId } });
        await db.product.deleteMany({ where: { id: productId } });
        for (const id of [factoryUserId, ownerUserId]) {
          await db.profile.deleteMany({ where: { id } });
          await admin.auth.admin.deleteUser(id).catch(() => undefined);
        }
      } finally {
        await db.$disconnect();
      }
    }, 60_000);

    it("FACTORY .select cannot see a PENDING_APPROVAL order even when needsRateApproval is false", async () => {
      const { data, error } = await factory
        .from("SalesOrder")
        .select("id, orderNumber, currentStatus")
        .eq("id", pendingApprovalOrderId);
      expect(error, JSON.stringify(error)).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it("FACTORY .select cannot see a needsRateApproval=true order", async () => {
      const { data, error } = await factory
        .from("SalesOrder")
        .select("id, orderNumber, needsRateApproval")
        .eq("id", pendingOrderId);
      // Either RLS returns zero rows (no error) or the schema owner
      // wraps it as an error — both prove denial. Assert data.length=0.
      expect(error, JSON.stringify(error)).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it("FACTORY .select CAN see a needsRateApproval=false order", async () => {
      const { data, error } = await factory
        .from("SalesOrder")
        .select("id, orderNumber, needsRateApproval")
        .eq("id", clearedOrderId);
      expect(error, JSON.stringify(error)).toBeNull();
      expect(data ?? []).toHaveLength(1);
      expect((data ?? [])[0]?.needsRateApproval).toBe(false);
    });

    it("FACTORY cannot UPDATE currentStatus on a pending order", async () => {
      const { data, error } = await factory
        .from("SalesOrder")
        .update({ currentStatus: "IN_PRODUCTION" })
        .eq("id", pendingOrderId)
        .select();
      // Two acceptable failure modes:
      //   (a) RLS UPDATE denies → zero rows updated, no error
      //   (b) BEFORE UPDATE trigger raises → error surfaces
      // Both prove the write path is closed. Also re-read to
      // confirm the row is unchanged.
      const noRowsChanged = !error && (data ?? []).length === 0;
      const triggerRaised =
        !!error && /rate approval|only update currentStatus/i.test(error.message);
      expect(noRowsChanged || triggerRaised).toBe(true);

      const fresh = await db.salesOrder.findUnique({
        where: { id: pendingOrderId },
        select: { currentStatus: true },
      });
      expect(fresh?.currentStatus).toBe("ORDER_PLACED");
    });

    it("Once the flag is cleared, FACTORY sees + advances the order", async () => {
      await db.salesOrder.update({
        where: { id: pendingOrderId },
        data: { needsRateApproval: false },
      });

      const { data: readBack } = await factory
        .from("SalesOrder")
        .select("id")
        .eq("id", pendingOrderId);
      expect(readBack ?? []).toHaveLength(1);

      const { error: updErr } = await factory
        .from("SalesOrder")
        .update({ currentStatus: "IN_PRODUCTION" })
        .eq("id", pendingOrderId);
      expect(updErr, JSON.stringify(updErr)).toBeNull();

      const fresh = await db.salesOrder.findUnique({
        where: { id: pendingOrderId },
        select: { currentStatus: true },
      });
      expect(fresh?.currentStatus).toBe("IN_PRODUCTION");
    });
  },
);
