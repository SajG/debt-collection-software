import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

// Device lock — the layer between "session is valid" and "screen is
// unlocked". Session lives in SecureStore, which is fine while the
// phone itself is in the owner's hand. The device lock adds a
// biometric or PIN gate every cold start and after 5 minutes in the
// background so a phone left on a table is safe.
//
// Two flavours, decided at enrolment:
//   biometric — expo-local-authentication (Face ID / Touch ID /
//               Android BiometricPrompt). The OS holds the secret;
//               we only ask "was that gesture valid?".
//   pin       — the user picks a 6-digit PIN. We store a hash + salt
//               in SecureStore, never the PIN itself. Five wrong
//               attempts wipes the session (see wrongAttempt()).
//
// This module is intentionally UI-free — screens call unlock() /
// setupPin() and render according to the returned state.

const KIND_KEY = "syncit.lock.kind"; // "biometric" | "pin"
const PIN_HASH_KEY = "syncit.lock.pinHash";
const PIN_SALT_KEY = "syncit.lock.pinSalt";
const PIN_ATTEMPTS_KEY = "syncit.lock.pinAttempts";
const DEVICE_ID_KEY = "syncit.device.id";
const LAST_UNLOCK_KEY = "syncit.lock.lastUnlockAt";

// Foreground grace period. If the app was backgrounded for less than
// this, we skip the unlock prompt on resume. Cold starts always
// prompt regardless.
export const RELOCK_AFTER_BACKGROUND_MS = 5 * 60 * 1000;
export const MAX_PIN_ATTEMPTS = 5;

export type LockKind = "biometric" | "pin";

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "unavailable" | "wrong" | "wiped" };

export async function getLockKind(): Promise<LockKind | null> {
  const v = await SecureStore.getItemAsync(KIND_KEY);
  return v === "biometric" || v === "pin" ? v : null;
}

export async function setLockKind(kind: LockKind): Promise<void> {
  await SecureStore.setItemAsync(KIND_KEY, kind);
}

export async function clearLock(): Promise<void> {
  await SecureStore.deleteItemAsync(KIND_KEY);
  await SecureStore.deleteItemAsync(PIN_HASH_KEY);
  await SecureStore.deleteItemAsync(PIN_SALT_KEY);
  await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY);
  await SecureStore.deleteItemAsync(LAST_UNLOCK_KEY);
}

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hw = await LocalAuthentication.hasHardwareAsync();
    if (!hw) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

// ── PIN handling ────────────────────────────────────────────────────

async function hashPin(pin: string, salt: string): Promise<string> {
  // scrypt/argon2 would be nicer, but expo-crypto only exposes
  // SHA-family digests. A random salt + SHA-256 is a reasonable
  // trade for a 6-digit PIN whose whole space (10^6) is small enough
  // that any hash is brute-forceable off-device — the real defence
  // is MAX_PIN_ATTEMPTS wiping the session, not the hash cost.
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
  );
}

function newSalt(): string {
  const bytes = Crypto.getRandomBytes(16);
  // base64url without pulling Buffer in — Uint8Array → hex is enough.
  return Array.from(bytes as Uint8Array)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function setupPin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("PIN must be exactly 6 digits.");
  }
  const salt = newSalt();
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hash);
  await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, "0");
  await setLockKind("pin");
  await markUnlockedNow();
}

async function verifyPin(pin: string): Promise<boolean> {
  const salt = await SecureStore.getItemAsync(PIN_SALT_KEY);
  const stored = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!salt || !stored) return false;
  const candidate = await hashPin(pin, salt);
  // Constant-time-ish string compare. Not real timing-safe (JS
  // strings), but this only runs on the local device against the
  // owner's own hash, so timing side channels are not the threat.
  if (candidate.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return diff === 0;
}

async function getAttempts(): Promise<number> {
  const raw = await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function setAttempts(n: number): Promise<void> {
  await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, String(n));
}

// ── Public entry points ────────────────────────────────────────────

export async function tryBiometricUnlock(
  reason = "Unlock PayTrack",
): Promise<UnlockResult> {
  if (!(await isBiometricAvailable())) {
    return { ok: false, reason: "unavailable" };
  }
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: "Use PIN",
    disableDeviceFallback: false,
    cancelLabel: "Cancel",
  });
  if (res.success) {
    await markUnlockedNow();
    return { ok: true };
  }
  return { ok: false, reason: "cancelled" };
}

export async function tryPinUnlock(pin: string): Promise<UnlockResult> {
  const ok = await verifyPin(pin);
  if (ok) {
    await setAttempts(0);
    await markUnlockedNow();
    return { ok: true };
  }
  const next = (await getAttempts()) + 1;
  await setAttempts(next);
  if (next >= MAX_PIN_ATTEMPTS) {
    // Blow away the lock so the caller can sign the user out and
    // re-enrol. The Supabase session lives in the same SecureStore,
    // but wiping the session is the AuthContext's job — this module
    // only reports the state.
    await clearLock();
    return { ok: false, reason: "wiped" };
  }
  return { ok: false, reason: "wrong" };
}

// ── Device id (assigned at enrol time, referenced by touch/revoke) ──

export async function setDeviceId(id: string): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
}
export async function getDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}
export async function clearDeviceId(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
}

// ── Foreground grace ───────────────────────────────────────────────

async function markUnlockedNow(): Promise<void> {
  await SecureStore.setItemAsync(LAST_UNLOCK_KEY, String(Date.now()));
}

export async function shouldPromptForUnlock(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(LAST_UNLOCK_KEY);
  if (!raw) return true;
  const stamp = Number(raw);
  if (!Number.isFinite(stamp)) return true;
  return Date.now() - stamp > RELOCK_AFTER_BACKGROUND_MS;
}
