"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { passwordSchema } from "@/lib/auth/password";
import { cookies } from "next/headers";
import {
  acceptInvitation,
  createAccountFromInvite,
  previewInvitation,
} from "@/lib/platform/invitations";
import { ensureStubProfile } from "@/lib/platform/resolve";
import { looksLikeInviteToken } from "@/lib/invite-token";

// SY42 — accept a staff invitation.
//
// The emailed token proves the invitee controls the mailbox, so a new
// account is created already email-confirmed with the password they
// choose here; no second verification email. An existing account must
// sign in first (we never attach a company to an unauthenticated
// session), and the signed-in address must match the invited one.

type Result = { error: string } | never;

const NOT_VALID = "This invitation is no longer valid. Ask your manager to send a new one.";

async function pinAndFinish(userId: string, organizationId: string) {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...(data.user?.app_metadata ?? {}), active_org_id: organizationId },
  });
}

function stampSession() {
  cookies().set("syncit_auth_since", String(Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

/** Signed-in user whose email matches the invite → join. */
export async function joinAsSignedInUserAction(input: { token: string }): Promise<Result> {
  if (!looksLikeInviteToken(input.token)) return { error: NOT_VALID };
  const preview = await previewInvitation(input.token);
  if (!preview.ok) return { error: NOT_VALID };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first, then accept the invitation." };
  if ((user.email ?? "").toLowerCase() !== preview.email.toLowerCase()) {
    return {
      error: `This invitation is for ${preview.email}. You are signed in as ${user.email ?? "another account"}.`,
    };
  }

  await ensureStubProfile(user);
  const res = await acceptInvitation({ invitationId: preview.id, profileId: user.id });
  if (!res.ok) return { error: res.message ?? NOT_VALID };

  await pinAndFinish(user.id, res.organizationId);
  // Fresh claim for the new membership before the next request.
  await supabase.auth.refreshSession();
  stampSession();
  redirect("/join/welcome");
}

const newAccountSchema = z.object({
  token: z.string(),
  ownerName: z.string().trim().min(2, "Enter your name").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  password: passwordSchema,
});

/** No account yet → create it (confirmed), join, sign in. */
export async function joinWithNewAccountAction(input: {
  token: string;
  ownerName: string;
  phone?: string;
  password: string;
}): Promise<Result> {
  const parsed = newAccountSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const { token, ownerName, phone, password } = parsed.data;
  if (!looksLikeInviteToken(token)) return { error: NOT_VALID };

  const res = await createAccountFromInvite({ token, ownerName, phone, password });
  if (!res.ok) return { error: res.message };

  const supabase = createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: res.email,
    password,
  });
  if (signInErr) redirect("/login");
  stampSession();
  redirect("/join/welcome");
}
