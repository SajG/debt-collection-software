import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/monitoring";
import { deleteOwnAccount } from "@/lib/platform/account-deletion";

// SY35 — POST /api/account/delete  { confirm: "DELETE" }
//
// Deletes the CALLER's own account (never anyone else's). Auth is the
// caller's Supabase access token: `Authorization: Bearer <jwt>` from the
// mobile app, or the web session cookie. Middleware lets this path
// through without a cookie; the token is verified here.
//
// 200 { ok: true }                     — deleted; client signs out
// 409 { code: "owner", companies }     — owner must transfer / delete first
// 400 / 401                            — bad confirm / not signed in

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ confirm: z.literal("DELETE") });

async function callerId(request: NextRequest): Promise<{ id: string; viaCookie: boolean } | null> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    const { data, error } = await createAdminClient().auth.getUser(bearer);
    return error || !data.user ? null : { id: data.user.id, viaCookie: false };
  }
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return user ? { id: user.id, viaCookie: true } : null;
}

export async function POST(request: NextRequest) {
  const caller = await callerId(request);
  if (!caller) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!bodySchema.safeParse(body).success) {
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  }

  try {
    const result = await deleteOwnAccount(caller.id);
    if (!result.ok && result.code === "owner") {
      return NextResponse.json(
        {
          error:
            "You own a company in Syncit. Make someone else the owner, or delete the company, before deleting your account.",
          code: "owner",
          companies: result.companies,
        },
        { status: 409 },
      );
    }
    if (!result.ok) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (caller.viaCookie) {
      await createClient().auth.signOut().catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    await captureError(e, { scope: "api.account.delete" });
    return NextResponse.json(
      { error: "Could not delete the account. Please try again or email support." },
      { status: 500 },
    );
  }
}
