"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/lib/tenant";
import { requireAdmin } from "@/lib/authz";
import { orgHasFeature } from "@/lib/platform/billing";
import { generatePairingCode, hashSecret } from "@/lib/tally/pairing";

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
  const db = tenantDb(admin.organizationId);
  const organizationId = admin.organizationId;

  // SY28 — Tally live sync is a plan feature.
  if (!(await orgHasFeature(organizationId, "tallyLiveSync"))) {
    return {
      error: "Tally live sync isn't on your plan. Upgrade in Settings → Billing, or use Excel import.",
    };
  }

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
  const db = tenantDb(admin.organizationId);
  const organizationId = admin.organizationId;

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

// Sync helpers moved to lib/tally/errors.ts — Next.js "use server"
// files may only export async functions.
