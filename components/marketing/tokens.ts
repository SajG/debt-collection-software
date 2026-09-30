// SY26 — shared marketing palette.
//
// Marketing pages render on the public marketing layout (no shadcn
// theme; we can't rely on --primary variables here). This file
// mirrors packages/tokens/tokens.json — every hex here matches one
// of the tokens (bond, kiln, cure, fault, bench, ink, inkMuted,
// line, curBg, faultBg) so the ESLint hex rule can whitelist this
// one file (see .eslintrc.json).
//
// Every marketing component imports colours from `mkt` — do not
// paste hex literals in page components.

export const mkt = {
  // Backgrounds
  bg: "#F5F2EC",       // warm stone (page)
  bgAlt: "#ECE8DF",    // subtle band
  white: "#FFFFFF",
  darkBg: "#093D30",   // bond — hero flourishes, security band

  // Text
  ink: "#1C1917",
  ink2: "#57534E",
  ink3: "#A8A29E",

  // Brand
  teal: "#0D5C4A",     // primary CTA
  tealDark: "#093D30",
  tealLight: "#E8F4F0",
  amber: "#9C6C0A",
  amberLight: "#FEF3C7",
  fault: "#B42318",
  faultLight: "#FEE4E2",

  // Borders / dividers
  border: "#DDD8CF",
  line: "#D8DEDC",
} as const;

export const mktType = {
  display: "var(--font-display)",
  body: "var(--font-body)",
} as const;
