"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { resolveOrgIdFromProfile } from "@/lib/tenancy";
import {
  generatePairingCode,
  hashSecret,
  normalizePairingCode,
} from "@/lib/tally/pairing";

// SY27 — Settings → Tally actions.
//
// * generatePairingCodeAction — ADMIN generates a fresh 8-char code
//   valid 15 min. Only the SHA-256 hash is stored; the plaintext is
//   returned to the browser exactly once, so the admin can read it
//   into the connector on the Tally PC.
// * revokeConnectorAction — flip revokedAt; every subsequent
//   /api/sync/tally call for that token 401s.

const PAIRING_TTL_MIN = 15;

type ActionResult<T = void> = { ok: true; data?: T } | { error: string };

export async function generatePairingCodeAction(): Promise<
  ActionResult<{ code: string; expiresAt: string }>
> {
  const admin = await requireAdmin();
  const organizationId = await resolveOrgIdFromProfile(admin.id);

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MIN * 60 * 1000);

  await db.tallyPairingCode.create({
    data: {
      organizationId,
      codeHash: hashSecret(code),
      createdById: admin.id,
      expiresAt,
    },
  });

  revalidatePath("/settings/tally");
  return { ok: true, data: { code, expiresAt: expiresAt.toISOString() } };
}

const revokeSchema = z.object({ connectorId: z.string().min(1) });

export async function revokeConnectorAction(input: {
  connectorId: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const organizationId = await resolveOrgIdFromProfile(admin.id);

  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const connector = await db.tallyConnector.findFirst({
    where: { id: parsed.data.connectorId, organizationId },
  });
  if (!connector) return { error: "Connector not found." };
  if (connector.revokedAt) return { ok: true };

  await db.tallyConnector.update({
    where: { id: connector.id },
    data: { revokedAt: new Date(), revokedById: admin.id },
  });

  revalidatePath("/settings/tally");
  return { ok: true };
}

// Used by a future cron to email the owner when a connector's
// lastSeenAt is older than 24h on a weekday. Not wired up yet;
// exported so the SY28 job can import it without duplication.
export function isStale(lastSeenAt: Date | null, now = new Date()): boolean {
  if (!lastSeenAt) return false;
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false; // Sat/Sun
  return now.getTime() - lastSeenAt.getTime() > 24 * 60 * 60 * 1000;
}

/** Convert a raw connector error string to plain English. Handles the
 *  common Tally failure modes so the admin sees "Tally is closed"
 *  instead of "ECONNREFUSED 127.0.0.1:9000". */
export function friendlyTallyError(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("econnrefused") || lower.includes("connection refused")) {
    return "Tally is not running. Open Tally on this PC and load the company.";
  }
  if (
    lower.includes("port 9000") ||
    lower.includes("port not enabled") ||
    lower.includes("odbc")
  ) {
    return "Port 9000 is not enabled — in Tally, F12 → Advanced → Allow ODBC/HTTP.";
  }
  if (lower.includes("no company") || lower.includes("company not loaded")) {
    return "No company is loaded in Tally. Select the company you want to sync.";
  }
  if (lower.includes("timeout")) {
    return "Tally didn't respond in time. Try again in a minute.";
  }
  return raw.slice(0, 240);
}

/** Normalise + hash a user-typed pairing code — kept exported so unit
 *  tests can round-trip against generatePairingCode. */
export function normalizeAndHash(input: string): string {
  return hashSecret(normalizePairingCode(input));
}
