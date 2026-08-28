#!/usr/bin/env node
//
// One-shot fetch of Inter + Inter Tight variable fonts from their
// upstream repos, self-hosted from then on. Ship the resulting
// files in git so the build never depends on the network. Runtime
// never touches Google Fonts — that would leak user IP and need
// a CSP connect-src exception.
//
// Sources:
//   Inter        — rsms/inter GitHub raw (InterVariable.woff2)
//   Inter Tight  — google/fonts GitHub raw (InterTight[wght].ttf)
//
// Usage:  npm run fonts:fetch

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);

const SOURCES = [
  {
    url: "https://github.com/rsms/inter/raw/master/docs/font-files/InterVariable.woff2",
    out: [
      "app/fonts/InterVariable.woff2",
      "mobile/assets/fonts/InterVariable.ttf", // Expo prefers ttf; keep the same bytes here — Metro handles it
    ],
    note: "Variable weight — Inter, self-hosted",
  },
  {
    url: "https://github.com/rsms/inter/raw/master/docs/font-files/InterVariable-Italic.woff2",
    out: ["app/fonts/InterVariable-Italic.woff2"],
    note: "Variable weight italic",
    optional: true,
  },
  {
    url: "https://github.com/google/fonts/raw/main/ofl/intertight/InterTight%5Bwght%5D.ttf",
    out: [
      "app/fonts/InterTight-Variable.ttf",
      "mobile/assets/fonts/InterTight-Variable.ttf",
    ],
    note: "Variable weight — Inter Tight, self-hosted",
  },
];

async function ensureDir(p) {
  const dir = dirname(p);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log("Fetching brand fonts…\n");
  for (const src of SOURCES) {
    try {
      console.log(`↓ ${src.note}`);
      const bytes = await download(src.url);
      for (const rel of src.out) {
        const full = join(REPO, rel);
        await ensureDir(full);
        await writeFile(full, bytes);
        console.log(`    ${rel}  (${bytes.length.toLocaleString()} bytes)`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (src.optional) {
        console.warn(`    skipped optional font: ${msg}`);
      } else {
        console.error(`    FAILED: ${msg}`);
        process.exitCode = 1;
      }
    }
  }
  console.log("\nDone. Commit these into git so builds never depend on the network.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
