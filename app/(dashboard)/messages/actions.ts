"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { checkSendRateLimit } from "@/lib/rate-limit";
import { sendReminder, type SendReminderResult } from "@/lib/messaging/send";

const sendInput = z.object({
  partyId: z.string().min(1),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]),
  invoiceId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

/**
 * Manual "send now" from the dashboard. Goes through sendReminder() and
 * therefore through the deterministic gate — a human clicking a button gets
 * no special bypass.
 */
export async function sendReminderAction(
  input: z.input<typeof sendInput>
): Promise<SendReminderResult> {
  const profile = await requireProfile();

  const parsed = sendInput.safeParse(input);
  if (!parsed.success) {
    return { status: "failed", error: "Invalid send request." };
  }
  const { partyId, channel, invoiceId } = parsed.data;

  const party = await db.party.findUnique({ where: { id: partyId } });
  if (!party || !canAccessParty(profile, party)) {
    return { status: "failed", error: "Party not found." };
  }

  const { limited } = await checkSendRateLimit(profile.id);
  if (limited) {
    return {
      status: "failed",
      error: "Too many sends in a short time — wait a minute and try again.",
    };
  }

  const result = await sendReminder({
    partyId,
    channel,
    invoiceId,
    sentById: profile.id,
  });

  revalidatePath(`/parties/${partyId}`);
  return result;
}
