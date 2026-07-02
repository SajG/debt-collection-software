import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SessionResult =
  | { user: NonNullable<Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"]>; unauthorized: null }
  | { user: null; unauthorized: NextResponse };

/**
 * Use at the top of every API Route handler.
 * Returns the authenticated Supabase user or a ready-to-return 401 response.
 *
 * @example
 * export async function GET() {
 *   const { user, unauthorized } = await requireSession();
 *   if (unauthorized) return unauthorized;
 *   // user is typed and guaranteed non-null here
 * }
 */
export async function requireSession(): Promise<SessionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      unauthorized: NextResponse.json(
        { error: "Unauthorised. Please log in and try again." },
        { status: 401 }
      ),
    };
  }

  return { user, unauthorized: null };
}
