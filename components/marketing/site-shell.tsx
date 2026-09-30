import { SiteNav } from "./site-nav";
import { SiteFooter } from "./site-footer";
import { mkt } from "./tokens";

// SY26 — shared shell used by every marketing route. Homepage
// applies its own hero background so it opts out of the padding
// by passing padded=false.

export function SiteShell({
  children,
  padded = true,
}: {
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        backgroundColor: mkt.bg,
        color: mkt.ink,
        fontFamily: "var(--font-body)",
      }}
    >
      <SiteNav />
      <main className={padded ? "py-14 sm:py-20" : undefined}>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Section({
  children,
  narrow,
  bg,
  id,
}: {
  children: React.ReactNode;
  narrow?: boolean;
  bg?: "bg" | "bgAlt" | "dark";
  id?: string;
}) {
  const bgColor =
    bg === "bgAlt" ? mkt.bgAlt : bg === "dark" ? mkt.darkBg : mkt.bg;
  return (
    <section
      id={id}
      className="py-16 sm:py-20"
      style={{ backgroundColor: bgColor }}
    >
      <div
        className={
          narrow
            ? "max-w-3xl mx-auto px-5 sm:px-8"
            : "max-w-6xl mx-auto px-5 sm:px-8"
        }
        style={bg === "dark" ? { color: "#FFFFFF" } : undefined}
      >
        {children}
      </div>
    </section>
  );
}

export function H2({
  children,
  center,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <h2
      className={
        "font-display font-bold mb-4 " + (center ? "text-center" : "")
      }
      style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}
    >
      {children}
    </h2>
  );
}
