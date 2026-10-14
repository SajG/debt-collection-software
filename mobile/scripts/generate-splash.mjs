#!/usr/bin/env node
// Renders assets/splash.png: the Syncit mark (brand variant, same
// geometry as src/components/SyncitMark.tsx) above the "Syncit"
// wordmark in Inter Tight, on bond green. app.json shows it at
// imageWidth 200; src/components/BrandSplash.tsx draws the same file at
// the same size so the native → JS hand-off doesn't jump.
//
// Run: node scripts/generate-splash.mjs   (needs the sharp devDependency)

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// sharp's text renderer (pango) finds fonts through fontconfig, which
// has no config on macOS — point it at the bundled brand fonts before
// sharp loads, or the wordmark silently falls back to a system face.
const fcDir = mkdtempSync(join(tmpdir(), "syncit-fc-"));
writeFileSync(
  join(fcDir, "fonts.conf"),
  `<?xml version="1.0"?><fontconfig><dir>${join(ROOT, "assets/fonts")}</dir><cachedir>${fcDir}</cachedir></fontconfig>`,
);
process.env.FONTCONFIG_FILE = join(fcDir, "fonts.conf");
const { default: sharp } = await import("sharp");
const SIZE = 1024;
const BG = "#093D30";

const markSize = 520;
const mark = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${markSize}" height="${markSize}" viewBox="0 0 512 512">
  <circle cx="206" cy="206" r="84" stroke="#3DDC97" stroke-width="40" fill="none"/>
  <circle cx="306" cy="306" r="84" stroke="#FFFFFF" stroke-width="40" fill="none"/>
  <path d="M 264.7 266.1 A 84 84 0 0 1 177.7 285.1" stroke="#3DDC97" stroke-width="40" fill="none"/>
</svg>`);

const word = await sharp({
  text: {
    text: '<span foreground="#FFFFFF" weight="bold" letter_spacing="-3072">Syncit</span>',
    font: "Inter Tight Bold",
    dpi: 720,
    rgba: true,
  },
})
  .png()
  .toBuffer();
const wordMeta = await sharp(word).metadata();

// The rings fill roughly 16%–80% of the mark's box. Centre the
// rings + gap + wordmark block vertically.
const ringsTop = Math.round(markSize * 0.16);
const ringsH = Math.round(markSize * 0.64);
const gap = 44;
const blockH = ringsH + gap + wordMeta.height;
const markTop = Math.round((SIZE - blockH) / 2) - ringsTop;
const wordTop = markTop + ringsTop + ringsH + gap;

await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: BG },
})
  .composite([
    { input: mark, top: markTop, left: Math.round((SIZE - markSize) / 2) },
    { input: word, top: wordTop, left: Math.round((SIZE - wordMeta.width) / 2) },
  ])
  .png()
  .toFile(join(ROOT, "assets/splash.png"));

console.log(`assets/splash.png written (wordmark ${wordMeta.width}×${wordMeta.height})`);
