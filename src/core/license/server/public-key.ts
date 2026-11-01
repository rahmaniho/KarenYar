/**
 * Canonical representation of a raw Ed25519 public key.
 * Accept standard base64 and base64url, with or without the one padding byte.
 * Reject whitespace, mixed alphabets, non-canonical trailing bits and wrong sizes.
 * This is public key material only; it never handles private keys.
 */
export function normalizeIssuerPublicKey(value: string): string {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{43}|[A-Za-z0-9_-]{43})=?$/.test(value)) {
    throw new Error('invalid_issuer_public_key');
  }
  const standard = value.replaceAll('-', '+').replaceAll('_', '/').replace(/=$/, '') + '=';
  let raw: string;
  try {
    raw = atob(standard);
  } catch {
    throw new Error('invalid_issuer_public_key');
  }
  if (raw.length !== 32 || btoa(raw) !== standard) {
    throw new Error('invalid_issuer_public_key');
  }
  return standard;
}
