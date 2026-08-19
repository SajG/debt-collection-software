/**
 * Static audit: every server action in admin/users/actions.ts calls
 * requireAdmin() first, before any DB mutation or Supabase Auth call.
 *
 * Two guards, one file — we can't reasonably spin up a full Next.js
 * server-action harness in vitest against real STAFF/ADMIN sessions,
 * so this test asserts the shape of the file:
 *   1. Every exported async function is admin-gated.
 *   2. requireAdmin() appears BEFORE the first db.$transaction /
 *      db.profile.* / supabase.auth.admin.* call in the function body.
 *
 * A STAFF caller who hits any of these actions therefore gets the
 * requireAdmin() redirect ("/dashboard") long before any write.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = resolve(
  __dirname,
  "..",
  "..",
  "app",
  "(dashboard)",
  "admin",
  "users",
  "actions.ts",
);
const SRC = readFileSync(FILE, "utf8");

const EXPORT_RE =
  /export\s+async\s+function\s+(\w+)\s*\([\s\S]*?\)\s*(?::\s*[\s\S]*?)?\{([\s\S]*?)\n\}/g;

function bodies(): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = EXPORT_RE.exec(SRC))) {
    out.push({ name: m[1], body: m[2] });
  }
  return out;
}

describe("admin/users/actions.ts — all exported server actions are ADMIN-gated", () => {
  const fns = bodies();

  it("finds at least the four expected server actions", () => {
    const names = fns.map((f) => f.name).sort();
    expect(names).toEqual(
      [
        "changeRoleAction",
        "createUserAction",
        "deactivateUserAction",
        "reactivateUserAction",
      ].sort(),
    );
  });

  it("every action calls requireAdmin()", () => {
    const offenders = fns.filter((f) => !/\brequireAdmin\s*\(/.test(f.body));
    expect(
      offenders.map((f) => f.name),
      "Missing requireAdmin(): " + offenders.map((f) => f.name).join(", "),
    ).toEqual([]);
  });

  it("requireAdmin() comes before the first mutation", () => {
    const MUTATION_RE =
      /\b(db\.\$transaction|db\.profile\.|db\.userAuditLog\.|supabase\.auth\.admin\.)/;
    const offenders: string[] = [];
    for (const f of fns) {
      const adminIdx = f.body.search(/\brequireAdmin\s*\(/);
      const mutIdx = f.body.search(MUTATION_RE);
      if (adminIdx === -1) {
        offenders.push(`${f.name}: no requireAdmin`);
        continue;
      }
      if (mutIdx !== -1 && mutIdx < adminIdx) {
        offenders.push(
          `${f.name}: mutation at index ${mutIdx} appears before requireAdmin at ${adminIdx}`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});
