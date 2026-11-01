import { describe, expect, it } from 'vitest';
import { normalizeIssuerPublicKey } from './public-key';

const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 31 + 251) % 256)).toString(
  'base64',
);

describe('issuer public key encoding', () => {
  it.each([
    ['standard padded', KEY],
    ['standard unpadded', KEY.replace(/=$/, '')],
    ['URL padded', KEY.replaceAll('+', '-').replaceAll('/', '_')],
    ['URL unpadded', KEY.replaceAll('+', '-').replaceAll('/', '_').replace(/=$/, '')],
  ])('normalizes %s to the same 32-byte public key', (_name, key) => {
    expect(normalizeIssuerPublicKey(key)).toBe(KEY);
  });

  it.each([
    '',
    'public',
    `${KEY}\n`,
    ` ${KEY}`,
    KEY.replace(/=$/, '=='),
    Buffer.alloc(31).toString('base64'),
    Buffer.alloc(33).toString('base64'),
    `${'A'.repeat(42)}B=`,
    `${'+-'.repeat(21)}A=`,
    'Ω'.repeat(43),
  ])('rejects malformed/non-canonical material: %j', (key) => {
    expect(() => normalizeIssuerPublicKey(key)).toThrow('invalid_issuer_public_key');
  });
});
