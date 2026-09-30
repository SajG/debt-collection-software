import { SiteShell } from "./site-shell";
import { mkt } from "./tokens";

// SY26 — shared shell for legal drafts.
//
// DRAFT — reviewed by counsel before launch. These pages were
// written to satisfy the visible-links requirement (Play Store,
// Razorpay, Google OAuth verification). They are NOT a substitute
// for a lawyer's review. The visible-to-users label was
// deliberately kept out of the rendered page per the brief; the
// warning lives here in the code so anyone editing is reminded.

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <SiteShell>
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: mkt.teal }}
        >
          Legal
        </p>
        <h1
          className="font-display font-bold mb-2"
          style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", color: mkt.ink }}
        >
          {title}
        </h1>
        <p className="text-sm mb-10" style={{ color: mkt.ink3 }}>
          Last updated {updated}. Governing law: India.
        </p>

        <article
          className="rounded-2xl p-8 border prose prose-neutral max-w-none"
          style={{ backgroundColor: mkt.white, borderColor: mkt.border, color: mkt.ink }}
        >
          {children}
        </article>
      </div>
    </SiteShell>
  );
}

export function H(props: { children: React.ReactNode }) {
  return (
    <h2
      className="font-display font-bold text-xl mt-8 mb-3"
      style={{ color: mkt.ink }}
    >
      {props.children}
    </h2>
  );
}

export function P(props: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed mb-3" style={{ color: mkt.ink2 }}>
      {props.children}
    </p>
  );
}

export function L(props: { children: React.ReactNode }) {
  return (
    <ul className="text-sm leading-relaxed mb-3 pl-5 list-disc space-y-1.5" style={{ color: mkt.ink2 }}>
      {props.children}
    </ul>
  );
}
