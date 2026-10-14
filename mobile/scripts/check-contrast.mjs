#!/usr/bin/env node
// WCAG AA contrast for the text/background pairs the app actually
// uses. Colours are read from src/theme.ts (generated from
// packages/tokens), so a token change that breaks a pair fails here.
// Run: npm run check:contrast
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const theme = readFileSync(join(ROOT, "src", "theme.ts"), "utf8");
const colors = Object.fromEntries(
  [...theme.matchAll(/^\s+(\w+):\s+"(#[0-9A-Fa-f]{6})",/gm)].map((m) => [m[1], m[2]]),
);

const tones = readFileSync(join(ROOT, "src", "lib", "tones.ts"), "utf8");
for (const m of tones.matchAll(/export const (\w+) = "(#[0-9A-Fa-f]{6})"/g)) colors[m[1]] = m[2];

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [text token, background token, minimum]. 4.5 = normal text; 3 = large
// (18pt+/bold 14pt+) text and icons.
const PAIRS = [
  ["text", "background", 4.5],
  ["text", "surface", 4.5],
  ["textMuted", "background", 4.5],
  ["textMuted", "surface", 4.5],
  ["primary", "background", 4.5],
  ["primary", "surface", 4.5],
  ["primaryOn", "primary", 4.5],
  ["danger", "background", 4.5],
  ["danger", "dangerBg", 4.5],
  ["white", "fault", 4.5],
  ["white", "bond", 4.5],
  ["ink", "curBg", 4.5],
  ["white", "amberSolid", 4.5],
  ["amberText", "curBg", 4.5],
];

let failed = 0;
for (const [fg, bg, min] of PAIRS) {
  const r = ratio(colors[fg], colors[bg]);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${fg} on ${bg}: ${r.toFixed(2)}:1 (needs ${min}:1)`);
}
console.log(failed ? `\ncheck-contrast: ${failed} pair(s) below AA.` : "check-contrast: all pairs meet AA.");
process.exit(failed ? 1 : 0);
