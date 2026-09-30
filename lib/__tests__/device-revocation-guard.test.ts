import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

// SY15.1 regression guard.
//
// The v13 audit finding was that Device revocation was cosmetic:
// public.current_user_role() read Profile only, never Device.
// The fix (migration 20260828080000_enforce_device_revocation)
// introduced public.current_device_ok() which checks Device.revokedAt,
// and rewrote current_user_role() to short-circuit on it.
//
// This test fails if either half regresses:
//   1. current_device_ok() body must mention Device."revokedAt"
//   2. current_user_role() body must reference current_device_ok()
//
// A migration that silently drops one of those references would
// re-open the hollow. We check ALL migration files, not just the
// original one, because a later "CREATE OR REPLACE FUNCTION" would
// win at runtime.

const MIGRATIONS_DIR = resolve(__dirname, "..", "..", "prisma", "migrations");

function readAllMigrationSql(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      name: e.name,
      sql: readFileSync(join(MIGRATIONS_DIR, e.name, "migration.sql"), "utf8"),
    }));
}

// Extract the *body* of the last CREATE OR REPLACE FUNCTION for a
// given fully-qualified name across all migrations. That is the one
// Postgres will execute — earlier definitions are shadowed.
function lastFunctionBody(fn: string): { migration: string; body: string } | null {
  const migrations = readAllMigrationSql();
  // Match up to and including the closing $$;
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${fn.replace(/\./g, "\\.")}\\s*\\(([\\s\\S]*?)\\$\\$\\s*;`,
    "gi",
  );
  let last: { migration: string; body: string } | null = null;
  for (const { name, sql } of migrations) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(sql))) {
      last = { migration: name, body: m[0] };
    }
  }
  return last;
}

describe("device revocation is enforced at the database (SY15.1 guard)", () => {
  it("current_device_ok() body still references Device.revokedAt", () => {
    const fn = lastFunctionBody("public.current_device_ok");
    expect(
      fn,
      "public.current_device_ok is not defined in any migration",
    ).not.toBeNull();
    expect(
      fn!.body,
      `Last definition in ${fn!.migration} no longer checks Device."revokedAt" — revocation would go cosmetic.`,
    ).toMatch(/"?Device"?[\s\S]*"?revokedAt"?\s+IS\s+NULL/i);
  });

  it("current_user_role() folds current_device_ok() into the answer", () => {
    const fn = lastFunctionBody("public.current_user_role");
    expect(
      fn,
      "public.current_user_role is not defined in any migration",
    ).not.toBeNull();
    expect(
      fn!.body,
      `Last definition in ${fn!.migration} no longer calls current_device_ok() — a revoked device would still return its role.`,
    ).toMatch(/current_device_ok\s*\(\s*\)/i);
  });
});
