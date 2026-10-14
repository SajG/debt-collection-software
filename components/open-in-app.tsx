import { storeLinks } from "@/lib/store-links";

// SY42 — "Open the Syncit app" for invited staff. The custom scheme
// opens the app's email sign-in with the address prefilled; if the app
// is not installed the store buttons (only the live ones) take over.
// Universal links need the Apple team id + a native rebuild and are a
// follow-up; the scheme works in every installed build.

export function OpenInApp({ email, token }: { email: string; token?: string }) {
  const links = storeLinks();
  // With a token the app's Join screen finishes the invitation itself;
  // without one it just opens sign-in with the address prefilled.
  const deep = token
    ? `syncit://join?token=${encodeURIComponent(token)}`
    : `syncit://email?email=${encodeURIComponent(email)}`;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">On your phone?</p>
      <p className="text-xs text-muted-foreground">
        {token ? (
          <>Accept this invitation inside the Syncit app — you will land on your own screen.</>
        ) : (
          <>
            Sign in to the Syncit app with <strong className="text-foreground">{email}</strong> and
            your password.
          </>
        )}
      </p>
      <a
        href={deep}
        className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Open the Syncit app
      </a>
      {links.android.live || links.ios.live ? (
        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have it?{" "}
          {links.android.live ? (
            <a className="text-primary underline-offset-4 hover:underline" href={links.android.url}>
              Google Play
            </a>
          ) : null}
          {links.android.live && links.ios.live ? " · " : null}
          {links.ios.live ? (
            <a className="text-primary underline-offset-4 hover:underline" href={links.ios.url}>
              App Store
            </a>
          ) : null}
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Get the app at{" "}
          <a className="text-primary underline-offset-4 hover:underline" href="/download">
            getsyncit.app/download
          </a>
          .
        </p>
      )}
    </div>
  );
}
