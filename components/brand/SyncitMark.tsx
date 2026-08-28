// Syncit logo mark.
//
// Source of truth: syncit-brand/*.svg. This component mirrors those
// files so React callers can render inline without shipping SVG
// through the asset pipeline. Keep in sync if the brand SVGs change.
//
// Variants:
//   <SyncitMark />              mono, currentColor. Use in sidebars,
//                               chips, PDF headers, notification
//                               icons — anywhere the container
//                               already sets the ink colour.
//   <SyncitMark variant="brand" />
//                               green + white rings on transparent
//                               background. Use on Bond-green
//                               surfaces (marketing, splash overlay).
//   <SyncitMark variant="brand" tile />
//                               full app-icon tile: rings on the
//                               dark-green gradient with rounded
//                               corners. For icon previews, marketing.
//   <SyncitMark variant="light" />
//                               dark rings for light backgrounds
//                               (letterhead, printed documents).
//
// Clear space on all sides = radius of one ring. Below 24px use the
// favicon SVG in syncit-brand/favicon.svg, which is tuned with
// thicker strokes for 16–32px rendering.

import * as React from "react";

const RINGS = (
  <>
    <circle cx={206} cy={206} r={84} />
    <circle cx={306} cy={306} r={84} />
    {/* Over-arc — same centre + radius as the first ring, drawn
        last so it lands over the second ring at the intersect and
        reads as "green passes over white". */}
    <path d="M 264.7 266.1 A 84 84 0 0 1 177.7 285.1" />
  </>
);

export function SyncitMark({
  size = 24,
  className,
  title = "Syncit",
  variant = "mono",
  tile = false,
}: {
  size?: number;
  className?: string;
  title?: string;
  variant?: "mono" | "brand" | "light";
  /** Only meaningful with variant="brand". Draws the dark-green
   *  gradient tile with rounded corners behind the rings. */
  tile?: boolean;
}) {
  const strokeWidth = 40;

  if (variant === "mono") {
    return (
      <svg
        role="img"
        aria-label={title}
        viewBox="0 0 512 512"
        width={size}
        height={size}
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      >
        <title>{title}</title>
        <g fill="none">{RINGS}</g>
      </svg>
    );
  }

  const ringA = variant === "light" ? "#12876C" /* Kiln */ : "#3DDC97"; /* Set */
  const ringB = variant === "light" ? "#0B1D18" /* Ink */ : "#FFFFFF";

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="none"
    >
      <title>{title}</title>
      {tile ? (
        <>
          <defs>
            <linearGradient
              id="syncit-mark-tile"
              x1="0"
              y1="0"
              x2="0.35"
              y2="1"
            >
              <stop offset="0" stopColor="#0D5342" />
              <stop offset="1" stopColor="#06291F" />
            </linearGradient>
          </defs>
          <rect
            width="512"
            height="512"
            rx="114"
            fill="url(#syncit-mark-tile)"
          />
        </>
      ) : null}
      <g fill="none" strokeWidth={strokeWidth}>
        <circle cx={206} cy={206} r={84} stroke={ringA} />
        <circle cx={306} cy={306} r={84} stroke={ringB} />
        <path
          d="M 264.7 266.1 A 84 84 0 0 1 177.7 285.1"
          stroke={ringA}
        />
      </g>
    </svg>
  );
}
