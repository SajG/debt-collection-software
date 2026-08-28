// SERVER-ONLY — Supabase Storage helpers for private buckets.
//
// Every upload goes through `hardenUpload` (lib/uploads/hardening.ts)
// so the persisted bytes are guaranteed:
//   * magic-byte-verified (allowlist: PDF, JPEG, PNG only)
//   * size-capped server-side (not just in the picker)
//   * EXIF-stripped for images
//   * re-encoded through sharp for images (polyglot defence)
//
// Every readback URL is served with `Content-Disposition: attachment`
// (via Supabase's `download` option on createSignedUrl) so a
// malicious SVG or HTML mislabelled as an image cannot execute in
// the origin — the browser downloads instead of rendering.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  hardenUpload,
  safeStorageName,
  type AllowedKind,
} from "@/lib/uploads/hardening";

export const LOGO_BUCKET = "company-logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
// Historical export — server no longer trusts the caller's Content-Type,
// but existing pages import these arrays for their picker's `accept`
// attribute. Kept intact.
export const LOGO_ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

/** Signed URLs are short-lived: consumed immediately by the settings
 *  preview or the server-side PDF renderer, never stored. */
const SIGNED_URL_EXPIRY_SECONDS = 300;

async function ensureBucket(name: string, maxBytes: number, mimeAllowlist: string[]) {
  const supabase = createAdminClient();
  const { data } = await supabase.storage.getBucket(name);
  if (data) return;
  const { error } = await supabase.storage.createBucket(name, {
    public: false,
    fileSizeLimit: maxBytes,
    allowedMimeTypes: mimeAllowlist,
  });
  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw new Error(`Could not create ${name} bucket: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// Company logo (admin-only, uploaded once per settings save)
// ─────────────────────────────────────────────────────────────────

export async function uploadCompanyLogo(
  file: { bytes: Buffer; contentType: string },
  previousPath: string | null,
): Promise<{ path: string } | { error: string }> {
  // SVG deliberately excluded here — hardening cannot re-encode
  // SVG safely (it is an XML script surface). If a distributor
  // needs a vector logo, they should provide a PNG export at
  // 512x512. Documented in SECURITY.md.
  const hardened = await hardenUpload({
    bytes: file.bytes,
    maxBytes: LOGO_MAX_BYTES,
    allow: ["jpeg", "png"],
    maxDimension: 1024,
  });
  if (!hardened.ok) return { error: hardened.error };

  await ensureBucket(LOGO_BUCKET, LOGO_MAX_BYTES, [
    "image/png",
    "image/jpeg",
  ]);
  const supabase = createAdminClient();
  const path = `logo-${Date.now()}.${hardened.ext}`;

  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, hardened.bytes, {
      contentType: hardened.contentType,
      upsert: false,
    });
  if (error) return { error: `Logo upload failed: ${error.message}` };

  if (previousPath && previousPath !== path) {
    await supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
  }
  return { path };
}

export async function getLogoSignedUrl(path: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(LOGO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS, {
      // Force download — the logo is rendered via <img src>, which
      // still respects the URL response. Attachment disposition
      // means even a mislabelled SVG cannot execute in this origin.
      download: extractFilename(path),
    });
  if (error || !data) return null;
  return data.signedUrl;
}

/** Raw logo bytes for server-side PDF rendering. */
export async function downloadLogoBytes(
  path: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (path.endsWith(".svg")) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(LOGO_BUCKET).download(path);
  if (error || !data) return null;
  return {
    bytes: Buffer.from(await data.arrayBuffer()),
    contentType: path.endsWith(".png") ? "image/png" : "image/jpeg",
  };
}

// ─────────────────────────────────────────────────────────────────
// Order documents (invoice / lorry receipt scans)
// ─────────────────────────────────────────────────────────────────

export const ORDER_DOC_BUCKET = "order-documents";
export const ORDER_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const ORDER_DOC_ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

const ORDER_DOC_KINDS: readonly AllowedKind[] = ["pdf", "jpeg", "png"];

export async function uploadOrderDocument(
  salesOrderId: string,
  file: { bytes: Buffer; contentType: string; fileName?: string },
): Promise<{ path: string } | { error: string }> {
  const hardened = await hardenUpload({
    bytes: file.bytes,
    maxBytes: ORDER_DOC_MAX_BYTES,
    allow: ORDER_DOC_KINDS,
  });
  if (!hardened.ok) return { error: hardened.error };

  await ensureBucket(
    ORDER_DOC_BUCKET,
    ORDER_DOC_MAX_BYTES,
    Object.keys(ORDER_DOC_ALLOWED_TYPES),
  );
  const supabase = createAdminClient();
  const path = `${salesOrderId}/${Date.now()}-${safeStorageName(file.fileName, hardened.ext)}`;

  const { error } = await supabase.storage
    .from(ORDER_DOC_BUCKET)
    .upload(path, hardened.bytes, {
      contentType: hardened.contentType,
      upsert: false,
    });
  if (error) return { error: `Upload failed: ${error.message}` };
  return { path };
}

export async function getOrderDocumentSignedUrl(
  path: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(ORDER_DOC_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS, {
      download: extractFilename(path),
    });
  if (error || !data) return null;
  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────────
// Payment proofs (bank / UPI / cheque photos)
// ─────────────────────────────────────────────────────────────────

export const PAYMENT_DOC_BUCKET = "payment-proofs";
export const PAYMENT_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10MB
// Kept for picker `accept` — HEIC / WEBP no longer accepted end-to-end
// because sharp cannot re-encode HEIC on every deployment (libheif is
// optional) and WEBP as a source adds a second decoder surface. Mobile
// converts to JPEG before upload; almost every phone already does.
export const PAYMENT_DOC_ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

const PAYMENT_DOC_KINDS: readonly AllowedKind[] = ["pdf", "jpeg", "png"];

export async function uploadPaymentDocument(
  paymentId: string,
  file: { bytes: Buffer; contentType: string; fileName?: string },
): Promise<{ path: string } | { error: string }> {
  const hardened = await hardenUpload({
    bytes: file.bytes,
    maxBytes: PAYMENT_DOC_MAX_BYTES,
    allow: PAYMENT_DOC_KINDS,
  });
  if (!hardened.ok) return { error: hardened.error };

  await ensureBucket(
    PAYMENT_DOC_BUCKET,
    PAYMENT_DOC_MAX_BYTES,
    Object.keys(PAYMENT_DOC_ALLOWED_TYPES),
  );
  const supabase = createAdminClient();
  const path = `${paymentId}/${Date.now()}-${safeStorageName(file.fileName, hardened.ext)}`;

  const { error } = await supabase.storage
    .from(PAYMENT_DOC_BUCKET)
    .upload(path, hardened.bytes, {
      contentType: hardened.contentType,
      upsert: false,
    });
  if (error) return { error: `Upload failed: ${error.message}` };
  return { path };
}

export async function getPaymentDocumentSignedUrl(
  path: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(PAYMENT_DOC_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS, {
      download: extractFilename(path),
    });
  if (error || !data) return null;
  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function extractFilename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}
