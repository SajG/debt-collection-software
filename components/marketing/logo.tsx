import { C } from "./tokens";

// Brand mark: three ledger rows being "checked off" — invoices getting paid.
// Drawn inline so it stays crisp at every size and can be recolored per surface.

type LogoVariant = "default" | "light";

export function LogoMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="PayTrack logo"
    >
      <rect width="32" height="32" rx="8" fill={C.teal} />
      <path
        d="M9 10.5h14"
        stroke={C.white}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M9 16h8.5"
        stroke={C.white}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M9 21.5h4.5"
        stroke={C.white}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M17 21.5l3.2 3.2 5.8-8"
        stroke={C.amberLight}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  variant = "default",
  markSize = 32,
  withWordmark = true,
}: {
  variant?: LogoVariant;
  markSize?: number;
  withWordmark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={markSize} />
      {withWordmark && (
        <span
          className="font-display font-semibold text-lg tracking-tight"
          style={{ color: variant === "light" ? C.white : C.ink }}
        >
          PayTrack
        </span>
      )}
    </span>
  );
}
