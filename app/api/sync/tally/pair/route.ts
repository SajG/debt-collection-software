import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { captureError } from "@/lib/monitoring";
import {
  generateConnectorToken,
  hashSecret,
  normalizePairingCode,
} from "@/lib/tally/pairing";

// SY27 — POST /api/sync/tally/pair
//
// Connector supplies:
//   { code: "ABCD1234", name: "SYNERGY-BILLING-PC" }
//
// Returns:
//   { token: "syt_...", organizationId, connectorId, name }
//
// Rules:
//   * Codes expire 15 min after generation (checked here + at generate
//     time; a stale code is refused with a generic message).
//   * A code is one-shot — consumedAt is stamped in the same
//     transaction the connector row is created.
//   * The plaintext token is returned ONCE. Only its hash is stored.
//     Connectors persist the token in their local secure store.
//   * This route is unauthenticated (the code IS the auth). Rate
//     limited by middleware.ts's per-IP /api/sync burst cap.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(80),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const code = normalizePairingCode(parsed.data.code);
  if (code.length < 6) {
    return NextResponse.json(
      { error: "Pairing code is not valid." },
      { status: 400 },
    );
  }

  const codeHash = hashSecret(code);
  const now = new Date();

  try {
    const pairing = await db.tallyPairingCode.findUnique({
      where: { codeHash },
    });
    if (!pairing) {
      return NextResponse.json(
        { error: "Pairing code is not valid." },
        { status: 400 },
      );
    }
    if (pairing.consumedAt) {
      return NextResponse.json(
        { error: "That pairing code has already been used." },
        { status: 400 },
      );
    }
    if (pairing.expiresAt.getTime() < now.getTime()) {
      return NextResponse.json(
        { error: "That pairing code has expired. Generate a fresh one." },
        { status: 400 },
      );
    }

    const token = generateConnectorToken();
    const tokenHash = hashSecret(token);

    const connector = await db.$transaction(async (tx) => {
      await tx.tallyPairingCode.update({
        where: { id: pairing.id },
        data: { consumedAt: now },
      });
      return tx.tallyConnector.create({
        data: {
          organizationId: pairing.organizationId,
          name: parsed.data.name,
          tokenHash,
        },
        select: { id: true, name: true, organizationId: true },
      });
    });

    return NextResponse.json({
      token,
      organizationId: connector.organizationId,
      connectorId: connector.id,
      name: connector.name,
    });
  } catch (e) {
    await captureError(e, { scope: "api.sync.tally.pair" });
    return NextResponse.json(
      { error: "Pairing failed. Try again." },
      { status: 500 },
    );
  }
}
