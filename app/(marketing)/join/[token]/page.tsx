import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { previewInvitation } from "@/lib/platform/invitations";
import { profileExistsForEmail } from "@/lib/platform/signup";
import { looksLikeInviteToken } from "@/lib/invite-token";
import { GoogleSignInButton } from "../../login/google-button";
import { isSignupEnabled } from "@/lib/signup-flag";
import { OpenInApp } from "@/components/open-in-app";
import { ANDROID_PACKAGE } from "@/lib/store-links";
import { AutoOpenInApp } from "./auto-open";
import { JoinSignedIn, JoinNewAccount } from "./join-forms";

export const metadata: Metadata = {
  title: "Join your team — Syncit",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const ROLE_LABEL = { ADMIN: "Management", STAFF: "Sales", FACTORY: "Factory" } as const;

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { web?: string };
}) {
  const token = params.token;
  const preview = looksLikeInviteToken(token)
    ? await previewInvitation(token)
    : ({ ok: false, error: "not_found" } as const);

  if (!preview.ok) {
    const message =
      preview.error === "expired"
        ? "This invitation has expired."
        : preview.error === "accepted"
          ? "This invitation was already used. Sign in to continue."
          : preview.error === "revoked"
            ? "This invitation was cancelled."
            : "This invitation link isn't valid.";
    return (
      <Shell title="Invitation unavailable">
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-sm text-muted-foreground">
          Ask your manager to send you a new invitation.
        </p>
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </Shell>
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = ROLE_LABEL[preview.role];
  // Android phones go straight to the app unless they just bounced back.
  const autoOpen = !user && searchParams?.web !== "1" ? (
    <AutoOpenInApp token={token} packageName={ANDROID_PACKAGE} />
  ) : null;
  const header = (
    <p className="text-sm text-muted-foreground">
      {preview.inviterName ?? "Your manager"} invited <strong className="text-foreground">{preview.email}</strong>{" "}
      to join <strong className="text-foreground">{preview.companyName}</strong> as{" "}
      <strong className="text-foreground">{role}</strong>.
    </p>
  );

  // Signed in as the invited address → one click.
  if (user && (user.email ?? "").toLowerCase() === preview.email.toLowerCase()) {
    return (
      <Shell title={`Join ${preview.companyName}`}>
        {header}
        <JoinSignedIn token={token} />
      </Shell>
    );
  }

  // Signed in as someone else.
  if (user) {
    return (
      <Shell title="Wrong account">
        {header}
        <p className="text-sm text-muted-foreground">
          You are signed in as <strong className="text-foreground">{user.email}</strong>. Sign out,
          then open this link again.
        </p>
        <form action="/auth/signout" method="post">
          <button className="w-full rounded-md border border-border px-4 py-2.5 text-sm font-semibold">
            Sign out
          </button>
        </form>
      </Shell>
    );
  }

  // Not signed in; account exists → sign in first.
  if (await profileExistsForEmail(preview.email.toLowerCase())) {
    const next = encodeURIComponent(`/join/${token}`);
    return (
      <Shell title={`Join ${preview.companyName}`}>
        {header}
        <p className="text-sm text-muted-foreground">
          You already have a Syncit account. Sign in with this email to accept.
        </p>
        <Link
          href={`/login?callbackUrl=${next}&email=${encodeURIComponent(preview.email)}`}
          className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Sign in with password
        </Link>
        <Link
          href={`/login?callbackUrl=${next}&email=${encodeURIComponent(preview.email)}&code=1`}
          className="flex w-full items-center justify-center rounded-md border border-border px-4 py-2.5 text-sm font-semibold"
        >
          Email me a code instead
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          No password yet?{" "}
          <Link
            href={`/login/forgot?email=${encodeURIComponent(preview.email)}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Set one
          </Link>
          .
        </p>
      </Shell>
    );
  }

  // New person.
  return (
    <Shell title={`Join ${preview.companyName}`}>
      {autoOpen}
      {header}
      <OpenInApp email={preview.email} token={token} />
      <JoinNewAccount
        token={token}
        email={preview.email}
        defaultName={preview.ownerName ?? ""}
        defaultPhone={preview.phone ?? ""}
      />
      {isSignupEnabled() ? (
        <>
          <p className="text-center text-xs text-muted-foreground">or</p>
          <GoogleSignInButton label="Continue with Google" next={`/join/${token}`} />
        </>
      ) : null}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
