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
