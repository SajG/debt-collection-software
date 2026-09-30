import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/db";

// SY22 — active organization switcher.
//
// Writes the caller's chosen organizationId into
// auth.users.raw_app_meta_data.active_org_id. current_org_id()
// reads this claim on every request; the JWT refresh cycle picks
// it up on the next token refresh (mobile client polls
// getSession() on foreground; SSR refreshes on every navigation).
//
// Gate: the target org must appear in the caller's active
// Membership rows. A stale claim written before a deactivation is
// stopped inside current_org_id() itself, but we prefer to also
// reject invalid inputs at write time so the API can't be used to
// probe for org existence.

export const runtime = "nodejs";

const bodySchema = z.object({
  organizationId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide { organizationId }" },
      { status: 400 },
    );
  }
  const { organizationId } = parsed.data;

  const membership = await db.membership.findFirst({
    where: {
      organizationId,
      profileId: user.id,
      isActive: true,
    },
    select: { id: true, role: true },
  });
  if (!membership) {
    // Same shape as the unauthenticated response — no oracle for
    // which orgs exist.
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      active_org_id: organizationId,
    },
  });
  if (error) {
    return NextResponse.json(
      { error: `Could not switch org: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, organizationId, role: membership.role });
}
