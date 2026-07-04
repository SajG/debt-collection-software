"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { actionSchema, type ActionInput } from "@/lib/validation";

type ActionResult = { error: string } | never;

export async function createFollowUpAction(
  input: ActionInput
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const data = parsed.data;

  const party = await db.party.findUnique({ where: { id: data.partyId } });
  if (!party || !canAccessParty(profile, party)) {
    return { error: "Party not found." };
  }

  await db.$transaction(async (tx) => {
    await tx.action.create({
      data: { ...data, performedById: profile.id },
    });
    if (data.outcome === "DISPUTED") {
      await pauseForDispute(tx, data.partyId);
    }
  });

  revalidatePath("/actions");
  revalidatePath(`/parties/${data.partyId}`);
  redirect(`/parties/${data.partyId}`);
}

/** DISPUTED outcome ⇒ all outreach to the party stops until a human clears it. */
async function pauseForDispute(
  tx: Pick<typeof db, "party">,
  partyId: string
): Promise<void> {
  await tx.party.update({
    where: { id: partyId },
    data: {
      outreachPaused: true,
      outreachPausedReason: "Dispute recorded — cleared only by an admin",
      outreachPausedAt: new Date(),
    },
  });
}

export async function updateFollowUpAction(
  id: string,
  input: ActionInput
): Promise<ActionResult> {
  const profile = await requireProfile();

  const existing = await db.action.findUnique({
    where: { id },
    include: { party: { select: { assignedToId: true } } },
  });
  if (!existing || !canAccessParty(profile, existing.party)) {
    return { error: "Follow-up not found." };
  }

  const parsed = actionSchema.safeParse({ ...input, partyId: existing.partyId });
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }
  const { partyId: _ignored, ...data } = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.action.update({ where: { id }, data });
    if (data.outcome === "DISPUTED" && existing.outcome !== "DISPUTED") {
      await pauseForDispute(tx, existing.partyId);
    }
  });

  revalidatePath("/actions");
  revalidatePath(`/parties/${existing.partyId}`);
  redirect("/actions");
}
