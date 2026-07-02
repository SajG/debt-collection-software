"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";

const signupSchema = z
  .object({
    businessName: z
      .string()
      .min(2, "Enter your business name")
      .max(100)
      .trim(),
    ownerName: z
      .string()
      .min(2, "Enter your name")
      .max(100)
      .trim(),
    email: z.string().email("Enter a valid email address").toLowerCase().trim(),
    phone: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number (e.g. 9876543210)"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must include at least one uppercase letter")
      .regex(/[0-9]/, "Must include at least one number")
      .regex(/[^A-Za-z0-9]/, "Must include at least one special character"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SignupInput = z.infer<typeof signupSchema>;
type ActionResult = { error: string; field?: keyof SignupInput } | never;

export async function signupAction(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      error: first.message,
      field: first.path[0] as keyof SignupInput,
    };
  }

  const { businessName, ownerName, email, phone, password } = parsed.data;

  // Determine role: first Profile in the DB = ADMIN (owner onboarding their instance).
  const existingCount = await db.profile.count();
  const role = existingCount === 0 ? ("ADMIN" as const) : ("STAFF" as const);

  // Register with Supabase Auth (GoTrue handles password hashing).
  const adminClient = createAdminClient();
  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm — owner is setting up their own instance
    });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: "An account with this email already exists.", field: "email" };
    }
    return { error: "Could not create your account. Please try again." };
  }

  const userId = authData.user.id;

  // Create domain profile linked to auth.users.id.
  await db.profile.create({
    data: {
      id: userId,
      businessName,
      ownerName,
      phone,
      role,
    },
  });

  // Sign the user in immediately (auto-confirmed above).
  const supabase = createClient();
  await supabase.auth.signInWithPassword({ email, password });

  redirect("/onboarding");
}
