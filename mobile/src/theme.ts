// One tokens file — every screen imports from here so future re-skinning
// is a single edit. Values chosen for a low-tech field user on a mid-range
// Android phone under variable lighting.

export const theme = {
  colors: {
    // SynWorks brand green
    primary: "#093D30",
    primaryOn: "#FFFFFF",
    background: "#FFFFFF",
    surface: "#F5F7F6",
    text: "#0B1D18",
    textMuted: "#5A6B65",
    border: "#D8DEDC",
    danger: "#B42318",
    dangerBg: "#FEE4E2",
    success: "#0E7C5F",
    focus: "#12876C",
  },
  // Minimum tap target — brief requires 56px, matches Material spec for
  // "large" buttons and is comfortable for users wearing gloves.
  tap: 56,
  radius: 12,
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  type: {
    // 16 body minimum per brief; larger scale for titles because these
    // users often hold the phone at arm's length.
    body: 18,
    bodySmall: 16,
    title: 28,
    heading: 22,
    button: 18,
  },
} as const;

export type Theme = typeof theme;
