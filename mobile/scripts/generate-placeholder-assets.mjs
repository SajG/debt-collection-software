// Emit valid solid-colour PNGs so `expo prebuild` / `eas build` succeeds
// before real brand assets exist. Swap the files in assets/ for finals
// whenever the design team ships them — this script is idempotent.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, c]);
}

function solidPng(w, h, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const rowLen = 1 + w * 3;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const o = y * rowLen + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const DARK = [9, 61, 48]; // #093D30 — SynWorks brand dark green

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "assets");
mkdirSync(assets, { recursive: true });

const targets = [
  ["icon.png", 1024, 1024],
  ["adaptive-icon.png", 1024, 1024],
  ["splash.png", 1284, 2778],
  ["favicon.png", 48, 48],
];

for (const [name, w, h] of targets) {
  writeFileSync(join(assets, name), solidPng(w, h, ...DARK));
  console.log(`wrote assets/${name} (${w}×${h})`);
}
