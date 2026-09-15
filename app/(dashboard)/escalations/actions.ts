"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireProfile, requireAdmin, canAccessParty } from "@/lib/authz";
import { nextStage } from "@/lib/recovery/escalation";
import { refreshRecommendation } from "@/lib/recovery/recommend";
import {
  escalationOpenSchema,
  escalationNoteSchema,
  type EscalationOpenInput,
  type EscalationNoteInput,
} from "@/lib/validation";

type ActionResult = { error: string } | { ok: true };

export async function openEscalation(input: EscalationOpenInput): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = escalationOpenSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const party = await db.party.findUnique({ where: { id: parsed.data.partyId } });
  if (!party || !canAccessParty(profile, party)) return { error: "Party not found." };

  const existing = await db.escalation.findFirst({
    where: { partyId: party.id, status: "OPEN" },
    select: { id: true },
  });
  if (existing) return { error: "This party already has an open escalation." };

  await db.escalation.create({
    data: {
      partyId: party.id,
      reason: parsed.data.reason,
      openedById: profile.id,
      events: {
        create: { toStage: "FLAGGED", note: parsed.data.reason, byId: profile.id },
      },
    },
  });

  revalidatePath("/escalations");
  return { ok: true };
}

export async function advanceEscalation(input: EscalationNoteInput): Promise<ActionResult> {
  const profile = await requireAdmin();
  const parsed = escalationNoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const escalation = await db.escalation.findUnique({
    where: { id: parsed.data.escalationId },
  });
  if (!escalation || escalation.status !== "OPEN") return { error: "Escalation not open." };

  const to = nextStage(escalation.stage);
  if (!to) return { error: "Already at the final stage (Legal)." };

  await db.escalation.update({
    where: { id: escalation.id },
    data: {
      stage: to,
      events: {
        create: {
          fromStage: escalation.stage,
          toStage: to,
          note: parsed.data.note,
          byId: profile.id,
        },
      },
    },
  });

  revalidatePath("/escalations");
  return { ok: true };
}

async function closeEscalation(
  input: EscalationNoteInput,
  status: "RESOLVED" | "DISMISSED"
): Promise<ActionResult> {
  const profile = await requireAdmin();
  const parsed = escalationNoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const escalation = await db.escalation.findUnique({
    where: { id: parsed.data.escalationId },
  });
  if (!escalation || escalation.status !== "OPEN") return { error: "Escalation not open." };

  await db.escalation.update({
    where: { id: escalation.id },
    data: {
      status,
      events: {
        create: {
          fromStage: escalation.stage,
          toStage: escalation.stage,
          note: `${status === "RESOLVED" ? "Resolved" : "Dismissed"}: ${parsed.data.note}`,
          byId: profile.id,
        },
      },
    },
  });

  revalidatePath("/escalations");
  return { ok: true };
}

export async function resolveEscalation(input: EscalationNoteInput): Promise<ActionResult> {
  return closeEscalation(input, "RESOLVED");
}

export async function dismissEscalation(input: EscalationNoteInput): Promise<ActionResult> {
  return closeEscalation(input, "DISMISSED");
}

export async function refreshPartyRecommendation(partyId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party || !canAccessParty(profile, party)) return { error: "Party not found." };

  await refreshRecommendation(partyId);
  revalidatePath(`/parties/${partyId}`);
  return { ok: true };
}

export async function addEscalationNote(input: EscalationNoteInput): Promise<ActionResult> {
  const profile = await requireProfile();
  const parsed = escalationNoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const escalation = await db.escalation.findUnique({
    where: { id: parsed.data.escalationId },
    include: { party: true },
  });
  if (!escalation || !canAccessParty(profile, escalation.party)) {
    return { error: "Escalation not found." };
  }

  await db.escalationEvent.create({
    data: {
      escalationId: escalation.id,
      fromStage: escalation.stage,
      toStage: escalation.stage,
      note: parsed.data.note,
      byId: profile.id,
    },
  });

  revalidatePath("/escalations");
  return { ok: true };
}
