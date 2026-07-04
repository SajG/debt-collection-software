// SERVER-ONLY — uses node:crypto and the deployment master key.
// Never import from a client component.
//
// Secrets (e.g. BusinessSettings.whatsappApiToken) are stored as
//   enc:v1:<iv b64>:<ciphertext b64>:<auth tag b64>
// AES-256-GCM with APP_ENCRYPTION_KEY (32 bytes, base64).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv, ciphertext, tag].map((b) => b.toString("base64")).join(":")
  );
}

export function decryptSecret(stored: string): string {
  // Values written before encryption existed are returned as-is so reads
  // keep working; they are re-encrypted on the next settings save.
  if (!isEncrypted(stored)) return stored;

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted value");
  const [iv, ciphertext, tag] = parts.map((p) => Buffer.from(p, "base64"));

  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
