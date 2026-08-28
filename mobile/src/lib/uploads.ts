// SDK 54 shipped a new File/Directory API at "expo-file-system"; the classic
// getInfoAsync / readAsStringAsync helpers we use are still shipped under
// the /legacy path. Swap when the classic helpers gain first-class replacements.
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// SY7: mobile uploads route through the server so every file gets
// magic-byte sniff + size cap + EXIF strip + image re-encode BEFORE
// it lands in Supabase Storage. The direct-to-storage path is gone
// — the anon key + the caller's session was enough for the storage
// RLS write, but there was no way to run sharp between the picker
// and the bucket.

export const PAYMENT_DOC_BUCKET = "payment-proofs";
export const ORDER_DOC_BUCKET = "order-documents";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function apiBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    apiBaseUrl?: string;
  };
  const explicit = extra.apiBaseUrl?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
  return fromEnv.replace(/\/+$/, "");
}

export type UploadKind = "order" | "payment";

/**
 * Upload a local file URI to Supabase Storage via the server-side
 * hardening endpoint. Returns the storage path the caller can then
 * write into the DB row (OrderDocument.storagePath /
 * PaymentDocument.storagePath) through its own server action.
 */
export async function uploadLocalFileViaServer({
  kind,
  scopeId,
  uri,
  fileName,
  mimeType,
}: {
  kind: UploadKind;
  /** Row id used to scope storage keys (order id / payment id). */
  scopeId: string;
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<{ path: string } | { error: string }> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return { error: "File no longer exists on device." };
  if (
    "size" in info &&
    typeof info.size === "number" &&
    info.size > MAX_UPLOAD_BYTES
  ) {
    return { error: "File must be 10 MB or smaller." };
  }

  const base = apiBaseUrl();
  if (!base) return { error: "Upload endpoint not configured." };

  // Bearer token so the API route sees the caller's session even
  // when cookies aren't in play (mobile does not use cookies).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { error: "Not signed in." };

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  try {
    const res = await fetch(`${base}/api/uploads/document`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind,
        scopeId,
        fileName: fileName ?? undefined,
        contentType: mimeType ?? undefined,
        base64,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: body.error ?? "Upload failed." };
    }
    const body = (await res.json()) as { path: string };
    return { path: body.path };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `Upload failed: ${e.message}`
          : "Upload failed.",
    };
  }
}

/** Signed URL for viewing a private object (5-min TTL, mirrors web app).
 *  Adds `download` so the browser saves the file instead of trying to
 *  render it — SY7 belt-and-braces against mislabelled polyglots even
 *  though the server now re-encodes images before storage. */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 300,
): Promise<string | null> {
  const filename = extractFilename(path);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, { download: filename });
  if (error || !data) return null;
  return data.signedUrl;
}

function extractFilename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

// ── Backwards compatibility ────────────────────────────────────────
// A handful of screens still import the old function name. Point it
// at the new server-hardened path; the old bucket + scopePrefix
// arguments map cleanly to the new (kind, scopeId) pair.
export async function uploadLocalFileToBucket(input: {
  bucket: string;
  scopePrefix: string;
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<{ path: string } | { error: string }> {
  const kind: UploadKind =
    input.bucket === PAYMENT_DOC_BUCKET ? "payment" : "order";
  return uploadLocalFileViaServer({
    kind,
    scopeId: input.scopePrefix,
    uri: input.uri,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
}
