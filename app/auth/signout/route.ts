import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// POST-only so it can't be triggered by a stray <img>/<a> prefetch.
// Clears the Supabase session server-side, hard-deletes any lingering
// sb-* cookies (SSR client is inconsistent about deleting them via setAll),
// then 303-redirects to /login as a full navigation.
async function signOutAndRedirect(request: Request) {
  const supabase = createClient();
  try {
    await supabase.auth.signOut();
  } catch {
    // Even if signOut fails, we still want to clear cookies + redirect.
  }

  const jar = cookies();
  for (const c of jar.getAll()) {
    if (c.name.startsWith("sb-")) {
      jar.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}

export async function POST(request: Request) {
  return signOutAndRedirect(request);
}

// Some clients (or accidental link prefetch) may issue GET — handle both.
export async function GET(request: Request) {
  return signOutAndRedirect(request);
}
