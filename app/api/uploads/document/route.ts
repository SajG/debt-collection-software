import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfileApi } from "@/lib/authz";
import {
  uploadOrderDocument,
  uploadPaymentDocument,
  ORDER_DOC_MAX_BYTES,
  PAYMENT_DOC_MAX_BYTES,
} from "@/lib/storage";

// Mobile document upload endpoint (SY7).
//
// Mobile used to upload straight to Supabase Storage with the user's
// anon-key session. That works for RLS but skips server-side
// hardening: no magic-byte sniff, no EXIF strip, no re-encode, and
// the client's Content-Type is the storage's Content-Type. This
// route puts every mobile upload through the same hardening as the
// web server actions:
//
//   1. Auth — requireProfileApi() rejects anons, deactivated
//      users, and returns a 401 the client can handle.
//   2. Body — base64 blob, JSON-encoded, capped to just above the
//      largest bucket ceiling so we don't parse a 100 MB payload
//      before rejecting it.
//   3. Hardening — hardenUpload() sniffs magic, caps size,
//      re-encodes images, strips EXIF.
//   4. Storage — the same uploadOrderDocument / uploadPaymentDocument
//      helpers the web pages use.
//
// The DB row that references the storage path (OrderDocument /
// PaymentDocument) is STILL written by the existing server action
// — the mobile client POSTs here to get a storage path, then calls
// its own action to record the row with per-order-scope checks.

// Base64 payload cap: encodes ~75% (base64 -> bytes ratio 3/4 = 0.75).
// The largest raw ceiling today is 10 MB, so 15 MB base64 is a safe
// upper bound on the request body itself.
const MAX_BODY_BYTES = 15 * 1024 * 1024;

const bodySchema = z.object({
  kind: z.enum(["order", "payment"]),
  scopeId: z.string().min(1).max(64),
  fileName: z.string().max(200).optional(),
  contentType: z.string().max(80).optional(),
  base64: z.string().min(1),
});

export async function POST(req: Request) {
  const { profile, failure } = await requireProfileApi();
  if (failure) return failure;

  // Coarse size gate on the request body itself, before JSON parse.
  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "File too large." },
      { status: 413 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body." },
      { status: 400 },
    );
  }
  const { kind, scopeId, fileName, base64 } = parsed.data;

  // Decode base64 → Buffer. Guard against a payload that decodes
  // larger than our per-bucket ceiling — the JSON body limit above
  // catches gross abuse; this is the fine-grained per-bucket cap.
  const maxRaw = kind === "order" ? ORDER_DOC_MAX_BYTES : PAYMENT_DOC_MAX_BYTES;
  const expectedRawSize = Math.floor((base64.length * 3) / 4);
  if (expectedRawSize > maxRaw) {
    return NextResponse.json(
      { error: `File must be ${Math.round(maxRaw / (1024 * 1024))} MB or smaller.` },
      { status: 413 },
    );
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "Invalid file bytes." }, { status: 400 });
  }
  if (bytes.length === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }

  // Log who is uploading what, without the bytes — helps trace when
  // sharp rejects something and the user reports "it won't upload".
  // Uses profile.id — the caller has already been through
  // requireProfileApi so `profile` is present.
  console.log(
    JSON.stringify({
      tag: "upload",
      by: profile.id,
      role: profile.role,
      kind,
      scopeId,
      bytes: bytes.length,
    }),
  );

  const uploader =
    kind === "order" ? uploadOrderDocument : uploadPaymentDocument;
  const result = await uploader(scopeId, {
    bytes,
    contentType: "application/octet-stream", // ignored — hardening derives real type
    fileName,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ path: result.path });
}

// Ensure Node runtime — sharp is a native module.
export const runtime = "nodejs";
