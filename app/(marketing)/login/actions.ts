"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  checkLoginRateLimit,
  recordLoginAttempt,
} from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
});

type LoginInput = z.infer<typeof loginSchema>;

type ActionResult = { error: string } | never;

export async function loginAction(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check your email and password and try again." };
  }

  const { email, password, callbackUrl } = parsed.data;

  // Defense-in-depth rate limit (Supabase also limits on their end).
  const { limited, retryAfterMinutes } = await checkLoginRateLimit(email);
  if (limited) {
    return {
      error: `Too many failed attempts. Please wait ${retryAfterMinutes} minutes and try again.`,
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await recordLoginAttempt(email, false);

    // Map Supabase error codes to plain-language messages.
    if (error.message.includes("Invalid login credentials")) {
      return { error: "The email or password you entered is incorrect." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "Please check your inbox and confirm your email first." };
    }
    if (error.status === 429) {
      return { error: "Too many attempts. Please wait a few minutes and try again." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  await recordLoginAttempt(email, true);

  const destination =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
  redirect(destination);
}
