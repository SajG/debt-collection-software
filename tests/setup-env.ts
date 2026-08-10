import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotenv(filename: string) {
  const p = join(process.cwd(), filename);
  if (!existsSync(p)) return;
  const src = readFileSync(p, "utf8");
  for (const line of src.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq === -1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotenv(".env");
loadDotenv(".env.local");
