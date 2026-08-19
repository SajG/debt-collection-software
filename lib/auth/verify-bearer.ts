import { timingSafeEqual } from "node:crypto";

/**
 * Verify an `Authorization: Bearer <secret>` header against one or
 * more expected secrets using a length-checked, timing-safe compare.
 *
 * Returns true when the header matches any expected secret. Missing
 * header, missing configured secret, or wrong scheme all return false.
 *
 * Never use `===` for secret comparison: it short-circuits on the
 * first differing byte, which leaks the secret one byte at a time
 * across many retry requests.
 */
export function verifyBearer(
  authHeader: string | null | undefined,
  ...expectedSecrets: (string | undefined | null)[]
): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const provided = authHeader.slice("Bearer ".length);
  const providedBuf = Buffer.from(provided);
  for (const expected of expectedSecrets) {
    if (!expected) continue;
    const expectedBuf = Buffer.from(expected);
    if (expectedBuf.length !== providedBuf.length) continue;
    try {
      if (timingSafeEqual(providedBuf, expectedBuf)) return true;
    } catch {
      // Different-length buffers throw; guarded above but keep the
      // try/catch defensively so a malformed header can't 500 the route.
    }
  }
  return false;
}
