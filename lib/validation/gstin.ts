// SY42 — GSTIN format + checksum. Pure; no network. A passing value is
// well-formed, not proof the registration exists.
//
// Layout (15 chars): 2-digit state code, 10-char PAN, 1 entity digit
// (1-9 or A-Z), literal "Z", 1 check character.

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHAPE = /^(0[1-9]|[1-2][0-9]|3[0-8]|9[79])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function isValidGstin(input: string): boolean {
  const g = normalizeGstin(input);
  if (!SHAPE.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARSET.indexOf(g[i]!);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = v * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = CHARSET[(36 - (sum % 36)) % 36];
  return g[14] === check;
}
