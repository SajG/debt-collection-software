"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { partySchema, type PartyInput } from "@/lib/validation";

type ActionResult = { error: string } | never;

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
