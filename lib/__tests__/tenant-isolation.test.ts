import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_MODELS } from "../tenant-models";

// SY22 — tenant isolation guard.
//
// A LIVE cross-org integration test needs `supabase start` + two
// authenticated JWTs; that harness runs in CI once Supabase local
// is wired. In the meantime, this file enforces the invariants
// that make live tests possible:
//
//   1. Every table listed in the SY21 migration with an
//      organizationId column appears in TENANT_MODELS in lib/tenant.ts
//      AND in the SY22 tenant-isolation policy loop. A new table
//      slipped in without both entries would leak across tenants.
//
//   2. The SY22 migration's RESTRICTIVE policy uses
//      `current_org_id()` — a regression that swaps in a permissive
//      predicate here is what let SY15.1 hide the device-revocation
//      hole.
//
//   3. Every SECURITY DEFINER RPC that inserts into a tenant table
//      must reference `current_org_id()` — grep-based check so an
//      "OR REPLACE" that forgets the org stamp fails loudly.

const MIGRATIONS_DIR = resolve(__dirname, "..", "..", "prisma", "migrations");

function sqlForMigrationSlug(slug: string): string {
  return readFileSync(
    join(MIGRATIONS_DIR, slug, "migration.sql"),
    "utf8",
  );
}

function readAllMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      name: e.name,
      sql: readFileSync(join(MIGRATIONS_DIR, e.name, "migration.sql"), "utf8"),
    }));
}

// Grab the ARRAY literal `tables text[] := ARRAY[...]` from a SQL
// block so the test can compare against TENANT_MODELS.
function extractSqlTables(sql: string): string[] {
  const m = sql.match(/tables\s+text\[\]\s*:=\s*ARRAY\[([\s\S]*?)\]/i);
  if (!m) return [];
  return Array.from(m[1].matchAll(/'([A-Za-z_]+)'/g)).map((r) => r[1]);
}

// Lowercase-first-letter to match Prisma model client keys.
function toClientKey(pascal: string): string {
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

describe("SY22 — tenant isolation invariants", () => {
  it("TENANT_MODELS matches the tables list in the SY21 backfill migration", () => {
    const sql = sqlForMigrationSlug("20260929030000_multi_tenant_orgs");
    // The SY21 migration has TWO tables[] arrays (ADD COLUMN loop and
    // the assertion loop). Both should be identical; take the first.
    const sqlTables = extractSqlTables(sql);
    // BusinessSettings gets its own explicit block in SY21 (not in
    // the loop) — but it IS in TENANT_MODELS and in the SY22 loop.
    const expectedFromSql = new Set(sqlTables.map(toClientKey));
    for (const m of TENANT_MODELS) {
      // BusinessSettings + OrgNumberSequence are added via explicit
      // blocks (not the tables[] loop), so allow them here.
      if (m === "businessSettings" || m === "orgNumberSequence") continue;
      expect(
        expectedFromSql.has(m),
        `TENANT_MODELS has "${m}" but the SY21 migration's ADD COLUMN loop does not — add it there too, or drop it from TENANT_MODELS.`,
      ).toBe(true);
    }
    Array.from(expectedFromSql).forEach((t) => {
      expect(
        TENANT_MODELS.includes(t as (typeof TENANT_MODELS)[number]),
        `SY21 migration adds organizationId to "${t}" but TENANT_MODELS is missing it — tenantDb() will skip its scoping.`,
      ).toBe(true);
    });
  });

  it("SY22 restrictive policy covers every tenant model", () => {
    const sql = sqlForMigrationSlug("20260929040000_sy22_tenant_isolation");
    const sqlTables = extractSqlTables(sql);
    const covered = new Set(sqlTables.map(toClientKey));
    for (const m of TENANT_MODELS) {
      expect(
        covered.has(m),
        `SY22 tenant-isolation loop does NOT list "${m}" — add it to the tables[] array so RLS covers cross-org reads.`,
      ).toBe(true);
    }
  });

  it("SY22 restrictive policy uses current_org_id and RESTRICTIVE mode", () => {
    const sql = sqlForMigrationSlug("20260929040000_sy22_tenant_isolation");
    expect(sql).toMatch(/AS RESTRICTIVE/i);
    expect(sql).toMatch(/USING\s*\(\s*"organizationId"\s*=\s*public\.current_org_id\s*\(\s*\)\s*\)/);
    expect(sql).toMatch(
      /WITH CHECK\s*\(\s*"organizationId"\s*=\s*public\.current_org_id\s*\(\s*\)\s*\)/,
    );
  });

  it("critical RPCs reference current_org_id", () => {
    // Latest CREATE OR REPLACE across migrations wins at runtime.
    const migrations = readAllMigrations();
    // register_device intentionally NOT in this list — Device rows
    // don't carry organizationId (they belong to the Profile identity
    // level). The RPC still checks that the caller has an active
    // Membership somewhere, which is enforced separately.
    const rpcs = [
      "create_sales_order_v2",
      "advance_order_status",
      "approve_order",
      "reject_order",
      "cancel_own_order",
    ];
    for (const name of rpcs) {
      const re = new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}[\\s\\S]*?\\$\\$\\s*;`,
        "gi",
      );
      let last: { migration: string; body: string } | null = null;
      for (const { name: mig, sql } of migrations) {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(sql))) last = { migration: mig, body: m[0] };
      }
      expect(last, `No definition of ${name} in any migration`).not.toBeNull();
      expect(
        last!.body,
        `${name} (last defined in ${last!.migration}) does not reference current_org_id() — it can act on cross-org rows.`,
      ).toMatch(/current_org_id\s*\(\s*\)/);
    }
  });

  it("current_user_role reads Membership scoped by current_org_id", () => {
    const migrations = readAllMigrations();
    const re =
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.current_user_role[\s\S]*?\$\$\s*;/gi;
    let last: { migration: string; body: string } | null = null;
    for (const { name, sql } of migrations) {
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(sql))) last = { migration: name, body: m[0] };
    }
    expect(last).not.toBeNull();
    // The latest definition (SY22) must use Membership + current_org_id.
    expect(last!.body).toMatch(/"Membership"/);
    expect(last!.body).toMatch(/current_org_id\s*\(\s*\)/);
  });
});
