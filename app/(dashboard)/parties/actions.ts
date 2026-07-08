"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { partySchema, type PartyInput } from "@/lib/validation";

type ActionResult = { error: string } | never;
type MaybeError = { error: string } | undefined;

export async function createPartyAction(input: PartyInput): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const data = parsed.data;

  // STAFF cannot assign parties to others — their creations belong to them.
  const assignedToId =
    profile.role === "ADMIN" ? data.assignedToId : profile.id;

  const party = await db.party.create({
    data: { ...data, assignedToId },
  });

  revalidatePath("/parties");
  redirect(`/parties/${party.id}`);
}

export async function updatePartyAction(
  id: string,
  input: PartyInput
): Promise<ActionResult> {
  const profile = await requireProfile();

  const existing = await db.party.findUnique({ where: { id } });
  if (!existing || !canAccessParty(profile, existing)) {
    return { error: "Party not found." };
  }

  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const data = parsed.data;

  // Only ADMIN may reassign ownership.
  const assignedToId =
    profile.role === "ADMIN" ? data.assignedToId : existing.assignedToId;

  await db.party.update({
    where: { id },
    data: { ...data, assignedToId },
  });

  revalidatePath("/parties");
  revalidatePath(`/parties/${id}`);
  redirect(`/parties/${id}`);
}

// ── Outreach compliance ─────────────────────────────────────────

const consentInput = z.object({
  partyId: z.string().min(1),
  status: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
});

/** Record the party's consent decision with a timestamp (audit trail). */
export async function setConsentAction(
  input: z.infer<typeof consentInput>
): Promise<MaybeError> {
  const profile = await requireProfile();

  const parsed = consentInput.safeParse(input);
  if (!parsed.success) return { error: "Invalid consent update." };
  const { partyId, status } = parsed.data;

  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party || !canAccessParty(profile, party)) {
    return { error: "Party not found." };
  }

  await db.party.update({
    where: { id: partyId },
    data: { consentStatus: status, consentUpdatedAt: new Date() },
  });

  revalidatePath(`/parties/${partyId}`);
  return undefined;
}

export async function pauseOutreachAction(
  partyId: string,
  reason: string
): Promise<MaybeError> {
  const profile = await requireProfile();

  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party || !canAccessParty(profile, party)) {
    return { error: "Party not found." };
  }

  await db.party.update({
    where: { id: partyId },
    data: {
      outreachPaused: true,
      outreachPausedReason: reason.trim().slice(0, 300) || "Paused manually",
      outreachPausedAt: new Date(),
    },
  });

  revalidatePath(`/parties/${partyId}`);
  return undefined;
}

/** Clearing a pause is a deliberate human decision — ADMIN only. */
export async function resumeOutreachAction(partyId: string): Promise<MaybeError> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") {
    return { error: "Only an admin can resume outreach after a pause." };
  }

  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party) return { error: "Party not found." };

  await db.party.update({
    where: { id: partyId },
    data: {
      outreachPaused: false,
      outreachPausedReason: null,
      outreachPausedAt: null,
    },
  });

  revalidatePath(`/parties/${partyId}`);
  return undefined;
}

const bulkAssignSchema = z.object({
  partyIds: z.array(z.string().min(1)).min(1, "Select at least one party").max(500),
  // null / "" = unassign
  assignedToId: z
    .string()
    .uuid()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

/** Bulk reassignment is a management task — ADMIN only. */
export async function bulkAssignPartiesAction(input: {
  partyIds: string[];
  assignedToId: string | null;
}): Promise<{ error: string } | { updated: number }> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") return { error: "Admin access required." };

  const parsed = bulkAssignSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  if (parsed.data.assignedToId) {
    const target = await db.profile.findUnique({
      where: { id: parsed.data.assignedToId },
      select: { id: true },
    });
    if (!target) return { error: "Selected team member not found." };
  }

  const result = await db.party.updateMany({
    where: { id: { in: parsed.data.partyIds } },
    data: { assignedToId: parsed.data.assignedToId },
  });

  revalidatePath("/parties");
  revalidatePath("/parties/assign");
  return { updated: result.count };
}
