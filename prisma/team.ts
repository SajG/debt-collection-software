import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Role } from "@prisma/client";

// TEAM roster loader. Reads a CSV so real names + phone numbers stay
// out of the git-tracked codebase. Two files, checked in this order:
//
//   1. prisma/team.local.csv    (gitignored — your real roster)
//   2. prisma/team.example.csv  (fake rows shipped with the repo)
//
// If neither file exists, TEAM is empty and seed.ts prints its
// "TEAM SEED SKIPPED" banner so no one silently ships an empty
// user table.
//
// CSV columns: ownerName,role,phone,email,note
//   * role  = ADMIN | STAFF | FACTORY (uppercased)
//   * phone = 10-digit Indian mobile (validated by PHONE_10 at call
//             sites); "PENDING" for rows you want the seed to skip
//   * email = optional; leave blank until you have the real address.
//             Fake TLDs (.local/.test/.invalid/.internal) are rejected
//             at the DB CHECK constraint + createUserAction validator,
//             so a placeholder here would fail on insert anyway.
//   * note  = free text (kept in memory only; not persisted)

export type TeamRow = {
  ownerName: string;
  role: Role;
  /** 10-digit local number or "PENDING" for rows we intentionally skip. */
  phone: string;
  email?: string | null;
  note?: string;
};

export const PHONE_10 = /^[6-9]\d{9}$/;

export function toE164(local: string): string {
  return `+91${local}`;
}

// ── CSV loading ────────────────────────────────────────────────────
// Deliberate: naive comma split with double-quote escaping only. The
// notes field is the only one that may contain commas; wrap it in
// double quotes if so. No streaming — the roster is tens of rows.

// Callers are ts-node CJS scripts (seed.ts, verify-team.ts,
// rotate-compromised-passwords.ts, backfill-team-emails.ts) so
// __dirname is safe. If this file ever gets imported from an ESM
// entrypoint, swap this for `fileURLToPath(import.meta.url)`.
const HERE = __dirname;

function csvPath(): string | null {
  const local = join(HERE, "team.local.csv");
  if (existsSync(local)) return local;
  const example = join(HERE, "team.example.csv");
  if (existsSync(example)) return example;
  return null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"' && cur.length === 0) { inQuotes = true; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out;
}

function parseTeamCsv(text: string): TeamRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = {
    ownerName: header.indexOf("ownername"),
    role: header.indexOf("role"),
    phone: header.indexOf("phone"),
    email: header.indexOf("email"),
    note: header.indexOf("note"),
  };
  if (idx.ownerName < 0 || idx.role < 0 || idx.phone < 0) {
    throw new Error(
      `prisma/team CSV: missing required columns (ownerName, role, phone) — got ${header.join(",")}`,
    );
  }

  const rows: TeamRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const role = (cells[idx.role] ?? "").trim().toUpperCase();
    if (role !== "ADMIN" && role !== "STAFF" && role !== "FACTORY") {
      throw new Error(
        `prisma/team CSV line ${i + 1}: role "${cells[idx.role]}" is not ADMIN|STAFF|FACTORY.`,
      );
    }
    const email = idx.email >= 0 ? (cells[idx.email] ?? "").trim() : "";
    const note = idx.note >= 0 ? (cells[idx.note] ?? "").trim() : "";
    rows.push({
      ownerName: (cells[idx.ownerName] ?? "").trim(),
      role: role as Role,
      phone: (cells[idx.phone] ?? "").trim(),
      email: email ? email : null,
      ...(note ? { note } : {}),
    });
  }
  return rows;
}

function loadTeam(): TeamRow[] {
  const path = csvPath();
  if (!path) return [];
  const text = readFileSync(path, "utf8");
  return parseTeamCsv(text);
}

export const TEAM: TeamRow[] = loadTeam();
