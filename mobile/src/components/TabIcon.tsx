import Svg, { Circle, Path } from "react-native-svg";

// Line icons for the bottom tab bar. Drawn as SVG rather than unicode
// glyphs because budget Android fonts are missing several of the
// symbols the old tab bar used (they rendered as empty boxes).

export type TabIconName =
  | "today"
  | "customers"
  | "orders"
  | "payments"
  | "make"
  | "dispatch"
  | "done"
  | "home"
  | "approvals"
  | "team"
  | "factory";

const PATHS: Record<TabIconName, string[]> = {
  today: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4", "M8.5 15l2.5 2.5 4.5-5"],
  customers: ["M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6", "M15.5 5.2a3.5 3.5 0 0 1 0 6.6", "M18 14.5c1.8.8 3 2.6 3 4.7"],
  orders: ["M5 3h11l3 3v15H5z", "M9 9h6", "M9 13h6", "M9 17h4"],
  payments: ["M7 5h10", "M7 9h10", "M7 5c4.5 0 6 1.8 6 4s-1.5 4-6 4l7 7"],
  make: ["M3 21V10l6 4v-4l6 4V5h6v16z", "M7 17h2", "M12 17h2", "M17 17h2"],
  dispatch: ["M2 6h12v10H2z", "M14 9h4l4 4v3h-8z", "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  done: ["M4 12.5l5 5L20 6.5"],
  home: ["M3 11l9-8 9 8", "M5 10v10h14V10", "M10 20v-6h4v6"],
  approvals: ["M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z", "M8.5 12l2.5 2.5 4.5-5"],
  team: ["M3 20c0-3 2.5-5.5 5.5-5.5S14 17 14 20", "M16 14.6c2.8.3 5 2.6 5 5.4", "M15 5.3a3.2 3.2 0 0 1 0 6"],
  factory: ["M3 21V10l6 4v-4l6 4V5h6v16z", "M7 17h2", "M12 17h2", "M17 17h2"],
};

// Icons that also need a head circle.
const HEADS: Partial<Record<TabIconName, { cx: number; cy: number; r: number }>> = {
  customers: { cx: 10, cy: 8, r: 3.5 },
  team: { cx: 8.5, cy: 8, r: 3.2 },
};

export function TabIcon({
  name,
  color,
  size = 26,
}: {
  name: TabIconName;
  color: string;
  size?: number;
}) {
  const head = HEADS[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {PATHS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          fill="none"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {head ? <Circle {...head} stroke={color} fill="none" strokeWidth={1.9} /> : null}
    </Svg>
  );
}
