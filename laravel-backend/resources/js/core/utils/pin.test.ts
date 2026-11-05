import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPin, isValidPinFormat, verifyPin } from './pin';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

describe('قفل PIN', () => {
  it('قالب PIN فقط ارقام ۴ تا ۱۲ تایی است', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('123456789012')).toBe(true);
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('12a4')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });

  it('هش پایدار است و خود PIN نیست', async () => {
    const hash = await hashPin('2468');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('2468');
    expect(await hashPin('2468')).toBe(hash);
  });

  it('راستی‌آزمایی PIN درست/غلط', async () => {
    const hash = await hashPin('1357');
    expect(await verifyPin('1357', hash)).toBe(true);
    expect(await verifyPin('1358', hash)).toBe(false);
    expect(await verifyPin('abc', hash)).toBe(false);
  });
});
