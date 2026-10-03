/**
 * SY33 — database functions are company-scoped.
 *
 * Runs REAL Postgres (PGlite, in-process WASM) — no network, no live
 * database. The schema comes from prisma/schema.prisma; Supabase's
 * auth.uid() / auth.jwt() are stubbed exactly as Supabase defines them
 * (from the request.jwt.claims setting); the RLS helper functions are
 * loaded from their latest migrations; then the SY33 migration is
 * applied as-is.
 *
 * Every client-callable function is called as an ADMIN of company B
 * with company A's ids, and must fail or return nothing while A's rows
 * stay untouched. Functions revoked from clients must be refused.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const MIGRATIONS = join(ROOT, "prisma", "migrations");
const SY28 = "20261001000000_sy28_billing";
const SY33 = "20261003000000_sy33_rpc_tenant_guards";

// Latest CREATE [OR REPLACE] FUNCTION public.<name>(...) in any
// migration up to (excluding) SY33.
function latestDefinition(name: string): string {
  let found: string | null = null;
  for (const dir of readdirSync(MIGRATIONS).sort()) {
    if (dir >= SY33 || !dir.match(/^\d/)) continue;
    const sql = readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8");
    const re = new RegExp(
      String.raw`CREATE (?:OR REPLACE )?FUNCTION\s+public\.${name}\s*\([\s\S]*?\$\$[\s\S]*?\$\$\s*;`,
      "g",
    );
    for (const m of Array.from(sql.matchAll(re))) found = m[0];
  }
  if (!found) throw new Error(`no definition for ${name}`);
  return found;
}

// Functions that exist before SY33 runs (as on the live database).
const PRE_EXISTING = [
  "current_device_ok",
  "current_org_id",
  "current_user_role",
  "check_order_create_rate_limit",
  "check_document_upload_rate_limit",
  "check_phone_otp_rate_limit",
  "check_email_otp_send_limit",
  "record_phone_otp_attempt",
  "is_provisioned_phone",
  "is_notification_config_ready",
  "consume_recovery_code",
  "count_active_recovery_codes",
  "rotate_recovery_codes",
  "register_device",
  "touch_device_seen",
];

// Exactly what a signed-in client may execute after SY33.
const AUTHENTICATED_ALLOW_LIST = [
  "advance_order_status",
  "approve_order",
  "reject_order",
  "cancel_own_order",
  "approve_rate",
  "set_user_active",
  "get_profile_directory",
  "revoke_device",
  "replace_sales_order_items",
  "create_sales_order",
  "create_sales_order_v2",
  "get_management_summary",
  "register_device",
  "touch_device_seen",
  "count_active_recovery_codes",
  "rotate_recovery_codes",
  "current_org_status",
  "current_org_writable",
  "current_org_id",
  "current_user_role",
  "current_device_ok",
].sort();

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000000";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000000";
const ADMIN_A = "aaaaaaaa-0000-0000-0000-0000000000a1";
const STAFF_A = "aaaaaaaa-0000-0000-0000-0000000000a2";
const ADMIN_B = "bbbbbbbb-0000-0000-0000-0000000000b1";
const STAFF_B = "bbbbbbbb-0000-0000-0000-0000000000b2";

let db: PGlite;

async function as<T>(
  user: string | null,
  org: string | null,
  fn: () => Promise<T>,
  role = "authenticated",
): Promise<T> {
  const claims = user
    ? { sub: user, role, app_metadata: org ? { active_org_id: org } : {} }
    : { role: "anon" };
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await db.exec(`SET ROLE ${user ? role : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims', '', false)");
  }
}

const asAdminB = <T>(fn: () => Promise<T>) => as(ADMIN_B, ORG_B, fn);

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

async function snapshotA(): Promise<string> {
  const tables = ["SalesOrder", "SalesOrderItem", "OrderStatusEvent", "Membership", "Device", "Product", "RecoveryCode"];
  const out: unknown[] = [];
  for (const t of tables) {
    const col = t === "Device" || t === "RecoveryCode" ? `"profileId"::text IN ('${ADMIN_A}','${STAFF_A}')` : `"organizationId" = '${ORG_A}'`;
    out.push(await rows(`SELECT * FROM "${t}" WHERE ${col} ORDER BY 1`));
  }
  return JSON.stringify(out);
}

beforeAll(async () => {
  db = new PGlite();
  const ddl = execFileSync(
    join(ROOT, "node_modules", ".bin", "prisma"),
    ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { cwd: ROOT, encoding: "utf8" },
  );

  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_app_meta_data jsonb);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  `);
  await db.exec(ddl);
  for (const name of PRE_EXISTING) await db.exec(latestDefinition(name));
  // Supabase grants table access to the client roles; RLS decides rows.
  await db.exec(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY profile_select_own ON "Profile" FOR SELECT TO authenticated USING (id = auth.uid());
    CREATE POLICY device_select_self ON "Device" FOR SELECT TO authenticated USING ("profileId" = auth.uid());
  `);
  // Mimic Supabase's default privileges: every function executable by
  // both client roles until SY33 locks it down.
  await db.exec(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;`);

  // SY28 (LOCKED read-only: policies + guard trigger), then SY33 and
  // every later migration, exactly as written.
  await db.exec(readFileSync(join(MIGRATIONS, SY28, "migration.sql"), "utf8"));
  for (const dir of readdirSync(MIGRATIONS).sort()) {
    if (dir >= SY33 && dir.match(/^\d/)) {
      await db.exec(readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8"));
    }
  }

  // ── seed two companies ──
  await db.exec(`
    INSERT INTO "Organization" (id, name, slug, status, plan) VALUES
      ('${ORG_A}', 'Alpha', 'alpha', 'ACTIVE', 'GROWTH'),
      ('${ORG_B}', 'Bravo', 'bravo', 'ACTIVE', 'GROWTH');
    INSERT INTO "Profile" (id, "businessName", "ownerName", role, "isActive", phone, "updatedAt") VALUES
      ('${ADMIN_A}', 'Alpha', 'Asha',  'ADMIN', true, '9000000001', now()),
      ('${STAFF_A}', 'Alpha', 'Arun',  'STAFF', true, '9000000002', now()),
      ('${ADMIN_B}', 'Bravo', 'Bina',  'ADMIN', true, '9000000003', now()),
      ('${STAFF_B}', 'Bravo', 'Bala',  'STAFF', true, '9000000004', now());
    INSERT INTO "Membership" (id, "organizationId", "profileId", role, "isOwner", "isActive", "createdAt") VALUES
      ('m-a1', '${ORG_A}', '${ADMIN_A}', 'ADMIN', true,  true, now()),
      ('m-a2', '${ORG_A}', '${STAFF_A}', 'STAFF', false, true, now()),
      ('m-b1', '${ORG_B}', '${ADMIN_B}', 'ADMIN', true,  true, now()),
      ('m-b2', '${ORG_B}', '${STAFF_B}', 'STAFF', false, true, now());
    INSERT INTO "BusinessSettings" (id, "organizationId", "orderApprovalMode", "updatedAt") VALUES
      ('bs-a', '${ORG_A}', 'NONE', now()), ('bs-b', '${ORG_B}', 'NONE', now());
    INSERT INTO "Party" (id, name, "organizationId", "totalOutstanding", "assignedToId", "updatedAt") VALUES
      ('party-a', 'Alpha Customer', '${ORG_A}', 900000, '${STAFF_A}', now()),
      ('party-b', 'Bravo Customer', '${ORG_B}', 1000,   '${STAFF_B}', now());
    INSERT INTO "Product" (id, name, brand, "isActive", "organizationId") VALUES
      ('prod-a', 'Glue A', 'A', true, '${ORG_A}'),
      ('prod-b', 'Glue B', 'B', true, '${ORG_B}');
    INSERT INTO "SalesOrder" (id, "orderNumber", "partyId", "salespersonId", "productId", brand, quantity,
                              "quantityUnit", "productRate", "orderValue", "currentStatus",
                              "needsRateApproval", "organizationId", "updatedAt") VALUES
      ('ord-a-pending', 'SB/26-27/0001', 'party-a', '${STAFF_A}', 'prod-a', 'A', 10, 'KG', '100', 1000,
       'PENDING_APPROVAL', true, '${ORG_A}', now()),
      ('ord-a-placed',  'SB/26-27/0002', 'party-a', '${STAFF_A}', 'prod-a', 'A', 10, 'KG', '100', 1000,
       'ORDER_PLACED', false, '${ORG_A}', now()),
      ('ord-b-placed',  'SB/26-27/0001', 'party-b', '${STAFF_B}', 'prod-b', 'B', 1, 'KG', '100', 100,
       'ORDER_PLACED', false, '${ORG_B}', now());
    INSERT INTO "Invoice" (id, "invoiceNumber", "partyId", "invoiceDate", "dueDate", "totalAmount",
                           status, "organizationId", "updatedAt") VALUES
      ('inv-a', 'A-1', 'party-a', now(), now(), 900000, 'OVERDUE', '${ORG_A}', now()),
      ('inv-b', 'B-1', 'party-b', now(), now(), 1000,   'OVERDUE', '${ORG_B}', now());
    INSERT INTO "Payment" (id, "partyId", amount, "paymentDate", method, "recordedById", "organizationId", "updatedAt") VALUES
      ('pay-a', 'party-a', 50000, now(), 'UPI', '${ADMIN_A}', '${ORG_A}', now()),
      ('pay-b', 'party-b', 250,   now(), 'UPI', '${ADMIN_B}', '${ORG_B}', now());
    INSERT INTO "Device" (id, "profileId", label, platform) VALUES
      ('dev-a', '${STAFF_A}', 'Arun phone', 'android');
    INSERT INTO "RecoveryCode" (id, "profileId", "codeHash") VALUES
      ('rc-a', '${ADMIN_A}', repeat('a', 64));
    INSERT INTO auth.users (id, raw_app_meta_data) VALUES ('${ADMIN_B}', '{}');
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function expectRefused(call: () => Promise<unknown>, pattern?: RegExp) {
  const before = await snapshotA();
  await expect(call()).rejects.toThrow(pattern ?? /./);
  expect(await snapshotA()).toBe(before);
}

describe("SY33 — scoped RPCs refuse company A ids for company B's ADMIN", () => {
  it("advance_order_status", async () => {
    await expectRefused(
      () => asAdminB(() => db.query(`SELECT * FROM advance_order_status('ord-a-placed', 'IN_PRODUCTION', NULL)`)),
      /Order not found/,
    );
  });

  it("the SY22 advance_order_status(text, OrderStatus, text) shim is gone", async () => {
    const r = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'advance_order_status'`,
    );
    expect(r[0]!.n).toBe(1);
  });

  it("approve_order", async () => {
    await expectRefused(() => asAdminB(() => db.query(`SELECT approve_order('ord-a-pending', 'ok')`)), /Order not found/);
  });

  it("reject_order", async () => {
    await expectRefused(() => asAdminB(() => db.query(`SELECT reject_order('ord-a-pending', 'no')`)), /Order not found/);
  });

  it("cancel_own_order", async () => {
    await expectRefused(() => asAdminB(() => db.query(`SELECT cancel_own_order('ord-a-placed', 'x')`)), /Order not found/);
  });

  it("approve_rate", async () => {
    await expectRefused(() => asAdminB(() => db.query(`SELECT approve_rate('ord-a-pending', 'ok')`)), /Order not found/);
  });

  it("set_user_active (incl. the per-company last-manager guard)", async () => {
    await expectRefused(
      () => asAdminB(() => db.query(`SELECT set_user_active($1::uuid, false, NULL)`, [STAFF_A])),
      /User not found/,
    );
    // B's admin is B's only ADMIN; company A's admins don't count.
    await expect(
      as(ADMIN_A, ORG_A, () => db.query(`SELECT set_user_active($1::uuid, false, NULL)`, [ADMIN_B])),
    ).rejects.toThrow(/User not found/);
  });

  it("get_profile_directory returns only company B members", async () => {
    const r = await asAdminB(() => rows<{ id: string }>(`SELECT id::text FROM get_profile_directory()`));
    expect(r.map((x) => x.id).sort()).toEqual([ADMIN_B, STAFF_B].sort());
  });

  it("revoke_device", async () => {
    await expectRefused(() => asAdminB(() => db.query(`SELECT revoke_device('dev-a')`)), /Device not found/);
  });

  it("replace_sales_order_items", async () => {
    await expectRefused(
      () =>
        asAdminB(() =>
          db.query(`SELECT * FROM replace_sales_order_items('ord-a-placed', $1::jsonb)`, [
            JSON.stringify([{ productId: "prod-b", quantity: 1, productRate: "1" }]),
          ]),
        ),
      /Order not found/,
    );
  });

  it("create_sales_order (v1) refuses company A's customer and product", async () => {
    const call = (party: string | null, product: string | null) =>
      asAdminB(() =>
        db.query(
          `SELECT * FROM create_sales_order($1, $2, 'X', 1, 'KG', NULL, NULL, '10', NULL, NULL, NULL, NULL, NULL,
                                            $3, NULL, $4, NULL)`,
          [party, product, party ? null : "Walk-in", product ? null : "New glue"],
        ),
      );
    await expectRefused(() => call("party-a", "prod-b"), /Customer not found/);
    await expectRefused(() => call("party-b", "prod-a"), /unavailable/);
  });

  it("create_sales_order (v1) creates inside company B with a company B number", async () => {
    const r = await asAdminB(() =>
      rows<{ id: string; orderNumber: string }>(
        `SELECT * FROM create_sales_order('party-b', 'prod-b', 'B', 1, 'KG', NULL, NULL, '10', NULL, NULL,
                                          NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
      ),
    );
    const row = (await rows<{ organizationId: string }>(
      `SELECT "organizationId"::text FROM "SalesOrder" WHERE id = $1`,
      [r[0]!.id],
    ))[0]!;
    expect(row.organizationId).toBe(ORG_B);
    expect(r[0]!.orderNumber).toMatch(/^SB\/\d\d-\d\d\/0002$/); // A's 0001/0002 don't count
  });

  it("create_sales_order_v2 refuses company A's customer and product", async () => {
    const call = (header: object, items: object[]) =>
      asAdminB(() =>
        db.query(`SELECT * FROM create_sales_order_v2($1::jsonb, $2::jsonb)`, [
          JSON.stringify(header),
          JSON.stringify(items),
        ]),
      );
    await expectRefused(
      () => call({ partyId: "party-a" }, [{ productId: "prod-b", quantity: 1, productRate: "1" }]),
      /Customer not found/,
    );
    await expectRefused(
      () => call({ partyId: "party-b" }, [{ productId: "prod-a", quantity: 1, productRate: "1" }]),
      /unavailable/,
    );
  });

  it("get_management_summary sums only company B", async () => {
    const r = await asAdminB(() => rows<{ s: Record<string, number> }>(`SELECT get_management_summary() AS s`));
    const s = r[0]!.s;
    expect(Number(s.totalOutstanding)).toBe(1000);
    expect(Number(s.overdueInvoicesCount)).toBe(1);
    expect(Number(s.overdueAmount)).toBe(1000);
    expect(Number(s.collectedThisMonth)).toBe(250);
    expect(Number(s.dsoDays)).toBe(90); // 1000 outstanding ÷ 1000 invoiced × 90
    await expect(
      as(STAFF_B, ORG_B, () => db.query(`SELECT get_management_summary()`)),
    ).rejects.toThrow(/Only ADMIN/);
  });
});

describe("SY33 — safe-by-design functions only touch the caller's own rows", () => {
  it("current_org_id / current_user_role ignore a claim for a company the caller isn't in", async () => {
    const r = await as(ADMIN_B, ORG_A, () =>
      rows<{ org: string | null; role: string | null }>(
        `SELECT current_org_id()::text AS org, current_user_role() AS role`,
      ),
    );
    expect(r[0]).toEqual({ org: null, role: null });
  });

  it("current_org_status / current_org_writable describe only the caller's company", async () => {
    const r = await as(ADMIN_B, ORG_A, () =>
      rows<{ status: string | null }>(`SELECT current_org_status()::text AS status`),
    );
    expect(r[0]!.status).toBeNull();
  });

  it("touch_device_seen can't touch another company's device", async () => {
    const before = await snapshotA();
    const r = await asAdminB(() => rows<{ ok: boolean }>(`SELECT * FROM touch_device_seen('dev-a')`));
    expect(r[0]!.ok).toBe(false);
    expect(await snapshotA()).toBe(before);
  });

  it("register_device only revokes the caller's own devices", async () => {
    const before = await snapshotA();
    await asAdminB(() => db.query(`SELECT * FROM register_device('{"label":"Bina phone"}'::jsonb)`));
    expect(await snapshotA()).toBe(before);
  });

  it("recovery codes: count/rotate act on the caller only", async () => {
    const before = await snapshotA();
    const n = await asAdminB(() => rows<{ n: number }>(`SELECT count_active_recovery_codes() AS n`));
    expect(n[0]!.n).toBe(0);
    await asAdminB(() => db.query(`SELECT rotate_recovery_codes(ARRAY[repeat('b', 64)])`));
    expect(await snapshotA()).toBe(before);
  });
});

describe("SY33 — RLS on tables outside the SY22 loop", () => {
  it("company B's ADMIN can't read company A's devices or profiles", async () => {
    // (B's own device from the register_device test is fine.)
    const devices = await asAdminB(() =>
      rows<{ profileId: string }>(`SELECT "profileId"::text AS "profileId" FROM "Device"`),
    );
    expect(devices.every((d) => d.profileId === ADMIN_B || d.profileId === STAFF_B)).toBe(true);
    expect(devices.some((d) => d.profileId === STAFF_A)).toBe(false);
    // …and A's ADMIN does see A's device (the policy still works).
    const own = await as(ADMIN_A, ORG_A, () => rows<{ id: string }>(`SELECT id FROM "Device"`));
    expect(own.map((d) => d.id)).toContain("dev-a");
    const people = await asAdminB(() => rows<{ id: string }>(`SELECT id::text FROM "Profile" ORDER BY 1`));
    expect(people.map((p) => p.id).sort()).toEqual([ADMIN_B, STAFF_B].sort());
  });
});

describe("SY33 — EXECUTE lockdown", () => {
  it("authenticated can execute exactly the allow-list", async () => {
    const r = await rows<{ proname: string }>(`
      SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       ORDER BY 1`);
    expect(r.map((x) => x.proname)).toEqual(AUTHENTICATED_ALLOW_LIST);
  });

  it("anon can execute only the RLS helpers", async () => {
    const r = await rows<{ proname: string }>(`
      SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
       ORDER BY 1`);
    expect(r.map((x) => x.proname)).toEqual(["current_device_ok", "current_org_id", "current_user_role"]);
  });

  it.each([
    [`SELECT consume_recovery_code('${ADMIN_A}'::uuid, repeat('a', 64))`],
    [`SELECT * FROM check_order_create_rate_limit('${ADMIN_A}'::uuid)`],
    [`SELECT * FROM check_document_upload_rate_limit('${ADMIN_A}'::uuid)`],
    [`SELECT is_provisioned_phone('9000000001')`],
    [`SELECT record_phone_otp_attempt('9000000001', false)`],
    [`SELECT is_notification_config_ready()`],
    [`SELECT _next_order_number('${ORG_A}'::uuid)`],
  [`SELECT _plan_seat_limit('STARTER')`],
  ])("a client is refused: %s", async (sql) => {
    await expectRefused(() => asAdminB(() => db.query(sql)), /permission denied/);
    await expectRefused(() => as(null, null, () => db.query(sql)), /permission denied/);
  });
});

describe("SY28/SY34 — LOCKED is read-only, PAST_DUE is not", () => {
  const order = () =>
    asAdminB(() =>
      db.query(
        `SELECT * FROM create_sales_order('party-b', 'prod-b', 'B', 1, 'KG', NULL, NULL, '10', NULL, NULL,
                                          NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
      ),
    );
  const setStatus = (status: string) =>
    db.query(`UPDATE "Organization" SET status = $1::"OrgStatus" WHERE id = $2::uuid`, [status, ORG_B]);

  afterAll(async () => {
    await setStatus("ACTIVE");
  });

  it("PAST_DUE (grace period) still accepts writes", async () => {
    await setStatus("PAST_DUE");
    await expect(order()).resolves.toBeTruthy();
  });

  it("LOCKED refuses RPC writes but reads, summaries and export queries still work", async () => {
    await setStatus("LOCKED");
    await expect(order()).rejects.toThrow(/SYNCIT_ORG_LOCKED/);
    const parties = await asAdminB(() => rows(`SELECT id FROM "Party" WHERE "organizationId" = '${ORG_B}'`));
    expect(parties.length).toBe(1);
    await expect(asAdminB(() => db.query(`SELECT get_management_summary()`))).resolves.toBeTruthy();
    const status = await asAdminB(() => rows<{ s: string }>(`SELECT current_org_status()::text AS s`));
    expect(status[0]!.s).toBe("LOCKED");
  });

  it("LOCKED refuses direct client writes through RLS (mobile path)", async () => {
    await setStatus("LOCKED");
    await db.exec(`
      ALTER TABLE "Action" ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS test_member_all ON "Action";
      CREATE POLICY test_member_all ON "Action" FOR ALL TO authenticated
        USING ("organizationId" = current_org_id()) WITH CHECK ("organizationId" = current_org_id());
      DROP TRIGGER IF EXISTS trg_sy28_guard_org_writable ON "Action";
    `); // trigger off → only the RESTRICTIVE policy stands in the way
    const insert = () =>
      asAdminB(() =>
        db.query(
          `INSERT INTO "Action" (id, "partyId", type, "performedAt", "performedById", "organizationId", "updatedAt")
           VALUES ('act-x', 'party-b', 'CALL', now(), '${ADMIN_B}', '${ORG_B}', now())`,
        ),
      );
    await expect(insert()).rejects.toThrow(/row-level security/);
    await setStatus("ACTIVE");
    await expect(insert()).resolves.toBeTruthy();
  });

  it("paying again (status back to ACTIVE) unlocks writes", async () => {
    await setStatus("ACTIVE");
    await expect(order()).resolves.toBeTruthy();
  });
});

describe("SY34 — seat limit on mobile reactivation", () => {
  it("set_user_active(…, true) refuses past the plan's seat limit", async () => {
    await db.exec(`
      UPDATE "Organization" SET plan = 'STARTER' WHERE id = '${ORG_B}';
      UPDATE "Membership" SET "isActive" = false WHERE id = 'm-b2';
    `);
    for (let i = 0; i < 4; i++) {
      const id = `bbbbbbbb-0000-0000-0000-00000000010${i}`;
      await db.exec(`
        INSERT INTO "Profile" (id, "businessName", "ownerName", role, "isActive", "updatedAt")
          VALUES ('${id}', 'Bravo', 'Extra ${i}', 'STAFF', true, now());
        INSERT INTO "Membership" (id, "organizationId", "profileId", role, "isActive", "createdAt")
          VALUES ('m-x${i}', '${ORG_B}', '${id}', 'STAFF', true, now());
      `);
    }
    await expect(
      asAdminB(() => db.query(`SELECT set_user_active($1::uuid, true, NULL)`, [STAFF_B])),
    ).rejects.toThrow(/allows 5 users/);

    await db.exec(`UPDATE "Organization" SET plan = 'GROWTH' WHERE id = '${ORG_B}'`);
    await expect(
      asAdminB(() => db.query(`SELECT set_user_active($1::uuid, true, NULL)`, [STAFF_B])),
    ).resolves.toBeTruthy();
  });

  it("the SQL seat limits match lib/plans.ts", async () => {
    const { entitlementsFor } = await import("../plans");
    for (const plan of ["TRIAL", "STARTER", "GROWTH", "BUSINESS"] as const) {
      const r = await rows<{ n: number | null }>(`SELECT _plan_seat_limit($1) AS n`, [plan]);
      expect(r[0]!.n).toBe(entitlementsFor(plan).seatLimit);
    }
  });
});
