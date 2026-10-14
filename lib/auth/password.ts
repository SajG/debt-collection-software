import { z } from "zod";

// SY42 — one password rule for sign-up, invite-accept and reset.
// Length beats composition rules; Supabase's leaked-password check
// (dashboard setting) covers the common-password case.
export const PASSWORD_MIN = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(72, "Use at most 72 characters.");
