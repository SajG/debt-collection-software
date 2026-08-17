// SERVER-ONLY — Supabase Storage helpers for the private company-logo
// bucket. Logos are uploaded via an admin-only server action and read
// through short-lived signed URLs (settings preview + PDF rendering);
// the bucket is never public.

import { createAdminClient } from "@/lib/supabase/admin";

export const LOGO_BUCKET = "company-logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
export const LOGO_ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

/** Signed URLs are short-lived: consumed immediately by the settings
 *  preview or the server-side PDF renderer, never stored. */
const SIGNED_URL_EXPIRY_SECONDS = 300;

async function ensureLogoBucket() {
  const supabase = createAdminClient();
  const { data } = await supabase.storage.getBucket(LOGO_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(LOGO_BUCKET, {
      public: false,
      fileSizeLimit: LOGO_MAX_BYTES,
      allowedMimeTypes: Object.keys(LOGO_ALLOWED_TYPES),
    });
    // Racing creation from two requests is fine — one wins, both proceed.
    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw new Error(`Could not create logo bucket: ${error.message}`);
    }
  }
}

export async function uploadCompanyLogo(
  file: { bytes: Buffer; contentType: string },
  previousPath: string | null
): Promise<{ path: string } | { error: string }> {
  const ext = LOGO_ALLOWED_TYPES[file.contentType];
  if (!ext) return { error: "Logo must be a PNG, JPG, or SVG file." };
  if (file.bytes.length > LOGO_MAX_BYTES) {
    return { error: "Logo must be 2MB or smaller." };
  }

  await ensureLogoBucket();
  const supabase = createAdminClient();
  const path = `logo-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file.bytes, { contentType: file.contentType, upsert: false });
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
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Raw logo bytes for server-side PDF rendering (no URL fetch from the
 *  renderer; SVG is unsupported by react-pdf Image and is skipped). */
export async function downloadLogoBytes(
  path: string
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
// Order documents (invoice / lorry receipt scans) — private bucket
// ─────────────────────────────────────────────────────────────────

export const ORDER_DOC_BUCKET = "order-documents";
export const ORDER_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const ORDER_DOC_ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function ensureOrderDocBucket() {
  const supabase = createAdminClient();
  const { data } = await supabase.storage.getBucket(ORDER_DOC_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(ORDER_DOC_BUCKET, {
      public: false,
      fileSizeLimit: ORDER_DOC_MAX_BYTES,
      allowedMimeTypes: Object.keys(ORDER_DOC_ALLOWED_TYPES),
    });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw new Error(`Could not create order-documents bucket: ${error.message}`);
    }
  }
}

export async function uploadOrderDocument(
  salesOrderId: string,
  file: { bytes: Buffer; contentType: string; fileName?: string }
): Promise<{ path: string } | { error: string }> {
  const ext = ORDER_DOC_ALLOWED_TYPES[file.contentType];
  if (!ext) return { error: "File must be a PDF, PNG, JPG, or WebP." };
  if (file.bytes.length > ORDER_DOC_MAX_BYTES) {
    return { error: "File must be 10MB or smaller." };
  }

  await ensureOrderDocBucket();
  const supabase = createAdminClient();
  const safeName = (file.fileName || `doc.${ext}`)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  const path = `${salesOrderId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(ORDER_DOC_BUCKET)
    .upload(path, file.bytes, { contentType: file.contentType, upsert: false });
  if (error) return { error: `Upload failed: ${error.message}` };
  return { path };
}

export async function getOrderDocumentSignedUrl(
  path: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(ORDER_DOC_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────────
// Payment proofs (bank / UPI / cheque photos) — private bucket
// Separate from order-documents so retention + access rules can
// diverge later (bank recon evidence often has its own audit window).
// ─────────────────────────────────────────────────────────────────

export const PAYMENT_DOC_BUCKET = "payment-proofs";
export const PAYMENT_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const PAYMENT_DOC_ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic", // iPhone default — accept, some browsers still send it
};

async function ensurePaymentDocBucket() {
  const supabase = createAdminClient();
  const { data } = await supabase.storage.getBucket(PAYMENT_DOC_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(PAYMENT_DOC_BUCKET, {
      public: false,
      fileSizeLimit: PAYMENT_DOC_MAX_BYTES,
      allowedMimeTypes: Object.keys(PAYMENT_DOC_ALLOWED_TYPES),
    });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw new Error(`Could not create payment-proofs bucket: ${error.message}`);
    }
  }
}

export async function uploadPaymentDocument(
  paymentId: string,
  file: { bytes: Buffer; contentType: string; fileName?: string }
): Promise<{ path: string } | { error: string }> {
  const ext = PAYMENT_DOC_ALLOWED_TYPES[file.contentType];
  if (!ext) {
    return { error: "File must be a PDF, PNG, JPG, WebP, or HEIC image." };
  }
  if (file.bytes.length > PAYMENT_DOC_MAX_BYTES) {
    return { error: "File must be 10MB or smaller." };
  }

  await ensurePaymentDocBucket();
  const supabase = createAdminClient();
  const safeName = (file.fileName || `proof.${ext}`)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  const path = `${paymentId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(PAYMENT_DOC_BUCKET)
    .upload(path, file.bytes, { contentType: file.contentType, upsert: false });
  if (error) return { error: `Upload failed: ${error.message}` };
  return { path };
}

export async function getPaymentDocumentSignedUrl(
  path: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(PAYMENT_DOC_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
