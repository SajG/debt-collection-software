// SDK 54 shipped a new File/Directory API at "expo-file-system"; the classic
// getInfoAsync / readAsStringAsync helpers we use are still shipped under
// the /legacy path. Swap when the classic helpers gain first-class replacements.
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

// SERVER MIRROR of lib/storage.ts constants — keep in lockstep.
export const PAYMENT_DOC_BUCKET = "payment-proofs";
export const ORDER_DOC_BUCKET = "order-documents";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

function guessContentType(uri: string, mimeType?: string | null): string {
  if (mimeType) return mimeType;
  const ext = uri.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Uploads a local file URI (from expo-image-picker) to a private Supabase
 * Storage bucket and returns the object path. Server-side rows point at
 * this path; short-lived signed URLs are used to render the image later.
 *
 * Uses base64 → Uint8Array because @supabase/supabase-js in React Native
 * can't stream a file URI directly. Fine for the 10 MB cap; if we ever
 * want bigger uploads we'd swap to `TUS` / resumable uploads.
 */
export async function uploadLocalFileToBucket({
  bucket,
  scopePrefix,
  uri,
  fileName,
  mimeType,
}: {
  bucket: string;
  /** Row id used as top-level key so RLS + retention rules can scope by parent. */
  scopePrefix: string;
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<{ path: string } | { error: string }> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return { error: "File no longer exists on device." };
  if ("size" in info && typeof info.size === "number" && info.size > MAX_UPLOAD_BYTES) {
    return { error: "File must be 10 MB or smaller." };
  }

  const contentType = guessContentType(fileName ?? uri, mimeType);
  const ext = contentType.split("/").pop() ?? "bin";
  const safeName = (fileName || `proof.${ext}`)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  const path = `${scopePrefix}/${Date.now()}-${safeName}`;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToUint8Array(base64);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) return { error: `Upload failed: ${error.message}` };
  return { path };
}

/** Signed URL for viewing a private object (5-min TTL, mirrors web app). */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 300
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Minimal base64 → Uint8Array without pulling in `buffer`. */
function base64ToUint8Array(base64: string): Uint8Array {
  // React Native / Hermes has global.atob since RN 0.72.
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
