import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account disabled — SynWorks" };

// Anyone who lands here still has an active Supabase session (we
// deliberately do NOT force sign-out at the middleware layer — the
// user needs to see this screen). Sign them out on load so the
// session cookies are cleared before they navigate away.
export default async function AccountDisabledPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Best-effort — a failure here just leaves the session cookie
    // hanging around, which the requireProfile guard catches on the
    // next request.
    try {
      await supabase.auth.signOut();
    } catch {
      /* non-fatal */
    }
  } else {
    // Nobody signed in — the page has no purpose without a session
    // context. Send them to /login.
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        Your account is disabled
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        An administrator has removed your access to SynWorks. Contact
        your admin to be reactivated — your data has not been deleted.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </main>
  );
}
