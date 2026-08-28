// SERVER-ONLY upload hardening. Everything an admin, salesperson, or
// factory user sends passes through here BEFORE it reaches Supabase
// Storage.
//
// Threats this covers:
//
//   1. **Wrong-type files.** A .pdf that is actually an HTML page
//      would execute as HTML if a browser fetched it with the
//      wrong Content-Type. We sniff magic bytes and reject
//      anything that isn't one of our three allowed shapes.
//
//   2. **Polyglot files.** A JPEG whose trailing bytes are valid
//      JavaScript (a real published attack against several image
//      hosts). We defeat this by re-encoding every image through
//      sharp — the output is a fresh JPEG or PNG that cannot be
//      an interpreter-friendly wrapper for anything else.
//
//   3. **EXIF leakage.** Field photos are taken at customer sites
//      and carry GPS coordinates plus device serials. Sharp's
//      `withMetadata` is a whitelist, not a blacklist — omitting
//      it drops every EXIF field including the ones we don't know
//      about yet.
//
//   4. **Client-lied Content-Type.** We derive the type from the
//      bytes we just verified; the caller's claim is ignored.
//
//   5. **Trojan filenames.** The output filename is derived from
//      the sniffed type, not the client string.
//
// PDFs are checked for magic bytes but NOT re-encoded — a re-render
// through pdf-lib strips form fields and interactive annotations
// customers legitimately use for signatures. The `%PDF-` sniff plus
// the download-attachment header (see storage.ts signed URLs) is the
// mitigation. Server storage limits belt-and-brace this.

import sharp from "sharp";

export type AllowedKind = "pdf" | "jpeg" | "png";

export type HardenResult =
  | {
      ok: true;
      /** Sanitised bytes. For images these are a fresh re-encode. */
      bytes: Buffer;
      /** Server-derived content type — do not trust the caller's. */
      contentType: string;
      /** Server-derived file extension for storage-key generation. */
      ext: string;
      /** Detected kind before re-encode; useful for choosing paths. */
      kind: AllowedKind;
    }
  | { ok: false; error: string };

const CONTENT_TYPE: Record<AllowedKind, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
};
const EXTENSION: Record<AllowedKind, string> = {
  pdf: "pdf",
  jpeg: "jpg",
  png: "png",
};

/** Read the first bytes and decide what we're actually looking at.
 *  Returns null when nothing matches our allowlist — do NOT return
 *  a "best guess"; that is how polyglots get through. */
export function sniffKind(bytes: Buffer): AllowedKind | null {
  if (bytes.length < 8) return null;
  // PDF: %PDF- at offset 0. Spec allows the header to sit up to 1024
  // bytes in from the start, but every real writer emits it at 0;
  // reject "PDF with junk prefix" because that is a common polyglot.
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "pdf";
  }
  // JPEG: SOI FF D8 FF, third byte typically E0/E1/DB. Trailer FF D9
  // is a nice-to-have but a truncated JPEG still decodes and sharp
  // will surface a clean error there.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A.
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  return null;
}

/**
 * Validate + sanitise. Callers pass raw bytes, a max size, and any
 * extra image constraints. Returns a fresh Buffer safe to persist
 * or an error string safe to show a user (never a stack trace).
 */
export async function hardenUpload(input: {
  bytes: Buffer;
  maxBytes: number;
  /** If set, restrict the allowlist further. Defaults to all three. */
  allow?: readonly AllowedKind[];
  /** Cap image dimensions post-resize. Default 4096. Prevents a
   *  40MP camera photo from turning into a 200 MB PNG re-encode. */
  maxDimension?: number;
}): Promise<HardenResult> {
  const { bytes, maxBytes } = input;
  const allow = new Set<AllowedKind>(input.allow ?? ["pdf", "jpeg", "png"]);
  const maxDim = input.maxDimension ?? 4096;

  // Size check FIRST — a malformed 100 MB "PDF" should not go
  // anywhere near sharp.
  if (bytes.length > maxBytes) {
    return {
      ok: false,
      error: `File must be ${humanBytes(maxBytes)} or smaller.`,
    };
  }
  if (bytes.length < 8) {
    return { ok: false, error: "File is too small to be a valid upload." };
  }

  const kind = sniffKind(bytes);
  if (!kind || !allow.has(kind)) {
    return {
      ok: false,
      error: "Only PDF, JPEG, and PNG files are accepted.",
    };
  }

  if (kind === "pdf") {
    // PDF — accept as-is once magic-byte checks pass. Attachment
    // disposition on the signed URL is the runtime mitigation
    // against a browser trying to render it as HTML.
    return {
      ok: true,
      bytes,
      contentType: CONTENT_TYPE.pdf,
      ext: EXTENSION.pdf,
      kind: "pdf",
    };
  }

  // Image path. Sharp:
  //   * .rotate()          — bake EXIF orientation into pixels then
  //                          drop the tag, so upside-down camera
  //                          shots don't render sideways elsewhere.
  //   * .withMetadata({})  — whitelist NOTHING. Every EXIF field
  //                          disappears; GPS, camera serial, device
  //                          make + model, timestamp, all gone.
  //   * .resize (inside)   — clamp to maxDim; a 40 MP camera image
  //                          becomes a manageable file.
  //   * .toFormat()        — re-encode to a fresh JPEG or PNG.
  //                          Neutralises polyglots because the
  //                          output is written from decoded pixels,
  //                          not the input byte stream.
  try {
    const pipeline = sharp(bytes, { failOn: "truncated" })
      .rotate()
      .resize({
        width: maxDim,
        height: maxDim,
        fit: "inside",
        withoutEnlargement: true,
      });
    // `withMetadata({})` keeps orientation only when explicitly asked;
    // pass nothing to strip everything.
    const outBuf =
      kind === "jpeg"
        ? await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
        : await pipeline.png({ compressionLevel: 9 }).toBuffer();
    return {
      ok: true,
      bytes: outBuf,
      contentType: CONTENT_TYPE[kind],
      ext: EXTENSION[kind],
      kind,
    };
  } catch (e) {
    // sharp throws on malformed input. Show a user-safe message; the
    // caller can log the underlying error separately.
    return {
      ok: false,
      error: "Image could not be processed. Try re-taking the photo.",
    };
  }
}

function humanBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Filename to hand Supabase Storage. The client's chosen name is
 *  used ONLY as a hint for the trailing slug; the extension always
 *  comes from `kind`. */
export function safeStorageName(
  hint: string | null | undefined,
  ext: string,
): string {
  const base = (hint ?? "upload")
    .replace(/\.[a-zA-Z0-9]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60);
  return `${base || "upload"}.${ext}`;
}
