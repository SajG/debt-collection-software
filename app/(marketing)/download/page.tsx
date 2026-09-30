import type { Metadata } from "next";
import { Download as DownloadIcon, Smartphone } from "lucide-react";
import { SiteShell, H2 } from "@/components/marketing/site-shell";
import { mkt } from "@/components/marketing/tokens";

export const metadata: Metadata = {
  title: "Download Syncit",
  description:
    "Download Syncit for Android, iOS, and the Windows Tally connector.",
  alternates: { canonical: "https://getsyncit.app/download" },
};

// TODO: replace these placeholder URLs with the real Play Store / App
// Store / connector download links when live.
const ANDROID_URL = "https://play.google.com/store/apps/details?id=app.getsyncit";
const IOS_LIVE = false; // flip true when App Store is live
const IOS_URL = "https://apps.apple.com/app/syncit/id0000000000";
const TALLY_CONNECTOR_URL = "https://getsyncit.app/downloads/syncit-tally-connector-setup.exe";

export default function DownloadPage() {
  return (
    <SiteShell>
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: mkt.teal }}
        >
          Download
        </p>
        <H2>Same account, everywhere your team works</H2>
        <p className="text-lg mb-10 max-w-2xl" style={{ color: mkt.ink2 }}>
          Sign in with the email your admin added. If you don&apos;t have an
          account yet,{" "}
          <a href="/signup" className="underline underline-offset-4" style={{ color: mkt.teal }}>
            start a free trial
          </a>{" "}
          on the web first.
        </p>

        <div className="grid gap-5 md:grid-cols-3">
          <PlatformCard
            title="Android"
            body="Requires Android 10+. Works on budget phones — designed for Sales and Factory field use."
            cta="Google Play"
            ctaHref={ANDROID_URL}
            available
          />
          <PlatformCard
            title="iOS"
            body="Requires iOS 15+. Same feature set as Android."
            cta={IOS_LIVE ? "App Store" : "Coming soon"}
            ctaHref={IOS_LIVE ? IOS_URL : ""}
            available={IOS_LIVE}
          />
          <PlatformCard
            title="Windows Tally connector"
            body="One-time install on the Windows PC that runs Tally. See /tally for the four-step setup."
            cta="Download .exe"
            ctaHref={TALLY_CONNECTOR_URL}
            available
            id="tally"
          />
        </div>

        <p className="mt-8 text-sm" style={{ color: mkt.ink3 }}>
          Prefer the browser? Sign in at{" "}
          <a href="/login" className="underline underline-offset-4" style={{ color: mkt.teal }}>
            getsyncit.app/login
          </a>
          .
        </p>
      </div>
    </SiteShell>
  );
}

function PlatformCard({
  title,
  body,
  cta,
  ctaHref,
  available,
  id,
}: {
  title: string;
  body: string;
  cta: string;
  ctaHref: string;
  available: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="rounded-2xl p-6 border flex flex-col"
      style={{ backgroundColor: mkt.white, borderColor: mkt.border }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: mkt.tealLight, color: mkt.teal }}
      >
        <Smartphone size={18} />
      </div>
      <h3 className="font-display font-bold text-xl mb-2" style={{ color: mkt.ink }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed mb-6 flex-1" style={{ color: mkt.ink2 }}>
        {body}
      </p>
      {available ? (
        <a
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl text-white"
          style={{ backgroundColor: mkt.teal }}
        >
          <DownloadIcon size={14} />
          {cta}
        </a>
      ) : (
        <span
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl"
          style={{ backgroundColor: mkt.bgAlt, color: mkt.ink3 }}
        >
          {cta}
        </span>
      )}
    </div>
  );
}
