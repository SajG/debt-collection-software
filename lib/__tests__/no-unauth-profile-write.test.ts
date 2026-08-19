/**
 * Static audit: no exported server action creates a Profile row without
 * first proving the caller is ADMIN.
 *
 * The failure mode this guards against is exactly the /signup route we
 * just deleted: an "use server" file that lets anyone with a browser
 * cause `db.profile.create({...})` to run.
 *
 * How the check works — for every file under app/ that declares
 * "use server", we scan for a `.profile.create(` or `.profile.upsert(`
 * call. If we find one, the same file must call `requireAdmin(` at
 * least once. Anything else fails the test with a clear message.
 *
 * This is a static grep, not a runtime test. It cannot catch
 * "requireAdmin was imported but not called on the specific code
 * path", so it is a floor, not a ceiling.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const APP_DIR = join(ROOT, "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (extname(name) === ".ts" || extname(name) === ".tsx") {
      out.push(full);
    }
  }
  return out;
}

const PROFILE_WRITE_RE = /\bprofile\s*\.\s*(create|upsert|createMany)\s*\(/;
const REQUIRE_ADMIN_RE = /\brequireAdmin\s*\(/;
const USE_SERVER_RE = /^\s*(?:"use server"|'use server')\s*;?\s*$/m;

describe("no server action creates a Profile without an ADMIN caller", () => {
  const files = walk(APP_DIR);

  it("app/ contains at least one server-action file (sanity)", () => {
    const hasServer = files.some((f) => USE_SERVER_RE.test(readFileSync(f, "utf8")));
    expect(hasServer).toBe(true);
  });

  it("every server action touching Profile is admin-gated", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!USE_SERVER_RE.test(src)) continue;
      if (!PROFILE_WRITE_RE.test(src)) continue;
      if (!REQUIRE_ADMIN_RE.test(src)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `The following "use server" files write to Profile without calling requireAdmin():\n  ${offenders.join(
            "\n  ",
          )}\n\nAdd requireAdmin() before creating a Profile, or move the write into a script under prisma/ or scripts/.`,
    ).toEqual([]);
  });
});
