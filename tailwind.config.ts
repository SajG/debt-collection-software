import type { Config } from "tailwindcss";
// Generated from packages/tokens/tokens.json. See packages/tokens/generate.mjs.
// Adds a `syncit` namespace (bg-syncit-bond, p-syncit-md, min-h-tap, …)
// without touching the existing shadcn HSL variables.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — .mjs file, ambient types not needed.
import { syncitTokens } from "./packages/tokens/tailwind.tokens.mjs";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Syncit brand ramp — usable as bg-syncit-bond, text-syncit-ink, ...
        syncit: syncitTokens.colors,
      },
      spacing: {
        // Prefixed p-syncit-md, m-syncit-lg, gap-syncit-sm, ...
        ...Object.fromEntries(
          Object.entries(syncitTokens.spacing).map(([k, v]) => [
            `syncit-${k}`,
            v,
          ]),
        ),
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Syncit-namespaced so shadcn's radius vars are untouched.
        ...Object.fromEntries(
          Object.entries(syncitTokens.radius).map(([k, v]) => [
            `syncit-${k}`,
            v,
          ]),
        ),
      },
      fontSize: syncitTokens.fontSize as unknown as Record<
        string,
        [string, { lineHeight: string }]
      >,
      minHeight: syncitTokens.minHeight,
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
