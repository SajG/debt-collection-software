#!/usr/bin/env node
//
// Raster the Syncit brand SVGs into every place the web and mobile
// builds expect PNGs. Re-run after touching any *.svg in this
// directory. Uses `sharp`, which handles SVG in via librsvg.
//
// Usage:  node syncit-brand/build-assets.mjs
//
// Idempotent — each run overwrites the outputs.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const BOND = { r: 9, g: 61, b: 48, alpha: 1 }; // #093D30

async function ensureDir(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function raster(svgPath, outPath, { size, bg }) {
  await ensureDir(outPath);
  const svg = await readFile(svgPath);
  const img = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  const out = bg
    ? img.flatten({ background: bg })
    : img;
  const png = await out.png().toBuffer();
  await writeFile(outPath, png);
  console.log(`  wrote ${outPath}`);
}

async function icoFromSvg(svgPath, outPath, size) {
  // ICO isn't in sharp's output set. Modern browsers accept a PNG
  // in a .ico file, so write a bare 32×32 PNG under the .ico name.
  // If a strict ICO container is ever required, switch to a
  // dedicated encoder — until then this is what favicons render as
  // on 100% of the browsers our users touch.
  await ensureDir(outPath);
  const svg = await readFile(svgPath);
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
  await writeFile(outPath, png);
  console.log(`  wrote ${outPath} (PNG under .ico extension)`);
}

async function main() {
  console.log("Rendering Syncit brand PNGs…\n");

  // ── Mobile (Expo picks these up on prebuild) ────────────────────
  console.log("mobile/assets/");
  await raster(
    join(HERE, "icon.svg"),
    join(REPO, "mobile/assets/icon.png"),
    { size: 1024 },
  );
  await raster(
    join(HERE, "adaptive-icon-foreground.svg"),
    join(REPO, "mobile/assets/adaptive-icon.png"),
    { size: 1024 },
  );
  // Splash renders the icon centred on the bond-green background
  // configured in app.json. Use the transparent-foreground SVG so
  // Expo can composite without doubling the green.
  await raster(
    join(HERE, "adaptive-icon-foreground.svg"),
    join(REPO, "mobile/assets/splash.png"),
    { size: 1024, bg: BOND },
  );
  await raster(
    join(HERE, "favicon.svg"),
    join(REPO, "mobile/assets/favicon.png"),
    { size: 48 },
  );

  // ── Web ─────────────────────────────────────────────────────────
  console.log("\napp/ + public/");
  // Next.js App Router looks for app/icon.svg (served as the site
  // icon) and app/apple-icon.png (Apple touch icon).
  await writeFile(
    join(REPO, "app/icon.svg"),
    await readFile(join(HERE, "icon.svg")),
  );
  console.log("  wrote app/icon.svg (copied from syncit-brand/icon.svg)");
  await raster(
    join(HERE, "icon.svg"),
    join(REPO, "app/apple-icon.png"),
    { size: 180 },
  );
  await icoFromSvg(
    join(HERE, "favicon.svg"),
    join(REPO, "public/favicon.ico"),
    32,
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
