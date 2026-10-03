import { tenantDb } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";

// SY21 — per-tenant secrets accessor.
//
// Reads BusinessSettings for the given organization first; falls
// back to the matching env var only for the Synergy migration
// window (slug='synergy'). Callers pass the organizationId — no
// hidden globals.
//
// Values stored in BusinessSettings are AES-256-GCM ciphertext
// (encryptSecret in lib/crypto.ts). This module decrypts server-
// side only; nothing here should ever land in a client payload.

export type WhatsAppSecrets = {
  phoneNumberId: string | null;
  businessAccountId: string | null;
  apiToken: string | null;
  templateName: string | null;
};

export type RazorpaySecrets = {
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
};

export type TallySecrets = {
  syncTokenHash: string | null;
  host: string | null;
  port: number | null;
  companyName: string | null;
};

type OrgSecretsRow = {
  organizationId: string;
  slug: string;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  whatsappApiToken: string | null;
  whatsappTemplateName: string | null;
  razorpayKeyId: string | null;
  razorpayKeySecret: string | null;
  razorpayWebhookSecret: string | null;
  tallySyncTokenHash: string | null;
  tallyHost: string | null;
  tallyPort: number | null;
  tallyCompanyName: string | null;
};

async function loadRow(organizationId: string): Promise<OrgSecretsRow | null> {
  const row = await tenantDb(organizationId).businessSettings.findUnique({
    where: { organizationId },
    select: {
      organizationId: true,
      whatsappPhoneNumberId: true,
      whatsappBusinessAccountId: true,
      whatsappApiToken: true,
      whatsappTemplateName: true,
      razorpayKeyId: true,
      razorpayKeySecret: true,
      razorpayWebhookSecret: true,
      tallySyncTokenHash: true,
      tallyHost: true,
      tallyPort: true,
      tallyCompanyName: true,
      organization: { select: { slug: true } },
    },
  });
  if (!row) return null;
  const { organization, ...rest } = row;
  return { ...rest, slug: organization.slug } as OrgSecretsRow;
}

/** Decrypt a stored ciphertext; empty / null passes through as null. */
function dec(v: string | null): string | null {
  if (!v) return null;
  try {
    return decryptSecret(v);
  } catch {
    // Malformed / plaintext leftover — return as-is so a re-save
    // path can re-encrypt without blowing up the read.
    return v;
  }
}

/** Env fallback only fires for the legacy Synergy tenant during
 *  the migration window. Any other org must set its secrets on
 *  the BusinessSettings row explicitly. */
function envFallbackAllowed(row: OrgSecretsRow | null): boolean {
  return (row?.slug ?? "") === "synergy";
}

export async function getWhatsAppSecrets(
  organizationId: string,
): Promise<WhatsAppSecrets> {
  const row = await loadRow(organizationId);
  const allowEnv = envFallbackAllowed(row);
  return {
    phoneNumberId:
      row?.whatsappPhoneNumberId ??
      (allowEnv ? process.env.WHATSAPP_PHONE_NUMBER_ID ?? null : null),
    businessAccountId: row?.whatsappBusinessAccountId ?? null,
    apiToken:
      dec(row?.whatsappApiToken ?? null) ??
      (allowEnv ? process.env.WHATSAPP_ACCESS_TOKEN ?? null : null),
    templateName:
      row?.whatsappTemplateName ??
      (allowEnv ? process.env.WHATSAPP_DISPATCH_TEMPLATE_NAME ?? null : null),
  };
}

export async function getRazorpaySecrets(
  organizationId: string,
): Promise<RazorpaySecrets> {
  const row = await loadRow(organizationId);
  const allowEnv = envFallbackAllowed(row);
  return {
    keyId:
      dec(row?.razorpayKeyId ?? null) ??
      (allowEnv ? process.env.RAZORPAY_KEY_ID ?? null : null),
    keySecret:
      dec(row?.razorpayKeySecret ?? null) ??
      (allowEnv ? process.env.RAZORPAY_KEY_SECRET ?? null : null),
    webhookSecret:
      dec(row?.razorpayWebhookSecret ?? null) ??
      (allowEnv ? process.env.RAZORPAY_WEBHOOK_SECRET ?? null : null),
  };
}

export async function getTallySecrets(
  organizationId: string,
): Promise<TallySecrets> {
  const row = await loadRow(organizationId);
  const allowEnv = envFallbackAllowed(row);
  return {
    // The Tally sync token itself is never stored — only its SHA-256
    // hash. Callers compare with timingSafeEqual.
    syncTokenHash:
      row?.tallySyncTokenHash ??
      (allowEnv ? process.env.TALLY_SYNC_TOKEN_HASH ?? null : null),
    host: row?.tallyHost ?? null,
    port: row?.tallyPort ?? null,
    companyName: row?.tallyCompanyName ?? null,
  };
}
