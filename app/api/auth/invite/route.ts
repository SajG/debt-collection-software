import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { passwordSchema } from "@/lib/auth/password";
import { looksLikeInviteToken } from "@/lib/invite-token";
import {
  createAccountFromInvite,
  previewInvitation,
} from "@/lib/platform/invitations";
import { profileExistsForEmail } from "@/lib/platform/signup";

// SY42 — the mobile Join screen's two calls. No session exists yet, so
// the 256-bit invitation token is the credential (like /status/<token>).
// Middleware marks /api/auth/* public and applies its per-IP burst cap.
//
//   GET  ?token=…  → what the invite is for (company, role, inviter) and
//                    whether the email already has an account.
//   POST {token, ownerName, phone?, password}
//                  → create the confirmed account + membership. The app
//                    then signs in with supabase.auth.signInWithPassword
//                    and runs its normal device registration.
//
// Unknown / expired / revoked / used tokens all answer the same 404 so
// the endpoint cannot be used to probe invitations.

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };
const NOT_FOUND = () =>
  NextResponse.json({ error: "invalid_invitation" }, { status: 404, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!looksLikeInviteToken(token)) return NOT_FOUND();
  const p = await previewInvitation(token);
  if (!p.ok) return NOT_FOUND();
  return NextResponse.json(
    {
      email: p.email,
      role: p.role,
      companyName: p.companyName,
      inviterName: p.inviterName,
      ownerName: p.ownerName,
      accountExists: await profileExistsForEmail(p.email.toLowerCase()),
    },
    { headers: NO_STORE },
  );
}

const bodySchema = z.object({
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

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: NO_STORE });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!looksLikeInviteToken(parsed.data.token)) return NOT_FOUND();

  const res = await createAccountFromInvite(parsed.data);
  if (!res.ok) {
    const status = res.error === "invalid" ? 404 : res.error === "failed" ? 500 : 409;
    return NextResponse.json(
      { error: res.error, message: res.message },
      { status, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    { ok: true, email: res.email, role: res.role },
    { headers: NO_STORE },
  );
}
