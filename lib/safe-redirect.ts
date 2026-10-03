// SY31 — same-origin redirect guard for callbackUrl / next params.
//
// `startsWith("/")` is not enough: "//evil.com" and "/\evil.com" are
// both treated by browsers as protocol-relative URLs to another host.
// Accept only a single leading "/" followed by a character that is
// neither "/" nor "\", with no backslashes or control characters
// anywhere. A bare "/" is allowed.

const SAFE_PATH_RE = /^\/(?![/\\])[^\\\s\x00-\x1f]*$/;

export function safePath(
  input: string | null | undefined,
  fallback: string,
): string {
  if (typeof input !== "string") return fallback;
  return SAFE_PATH_RE.test(input) ? input : fallback;
}
