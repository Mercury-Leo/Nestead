// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decryptKey, encryptKey, importSecret } from './crypto';

function secretOf(seed: number): string {
  return btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => (i * 7 + seed) % 256)));
}

const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef';
const FAMILY = '11111111-1111-4111-8111-111111111111';
const OTHER_FAMILY = '22222222-2222-4222-8222-222222222222';

async function secret(seed = 1): Promise<CryptoKey> {
  const key = await importSecret(secretOf(seed));
  if (key === null) throw new Error('secret refused');
  return key;
}

describe('family key encryption', () => {
  it('round-trips a key for its own family', async () => {
    const s = await secret();
    const stored = await encryptKey(KEY, FAMILY, s);
    expect(stored).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(stored).not.toContain(KEY);
    expect(await decryptKey(stored, FAMILY, s)).toBe(KEY);
  });

  it('encrypts the same key differently every time', async () => {
    const s = await secret();
    expect(await encryptKey(KEY, FAMILY, s)).not.toBe(await encryptKey(KEY, FAMILY, s));
  });

  it('does not open for another family', async () => {
    const s = await secret();
    expect(await decryptKey(await encryptKey(KEY, FAMILY, s), OTHER_FAMILY, s)).toBeNull();
  });

  it('does not open once changed', async () => {
    const s = await secret();
    const [version, iv, sealed] = (await encryptKey(KEY, FAMILY, s)).split(':') as [string, string, string];
    const flip = (text: string): string => (text[0] === 'A' ? 'B' : 'A') + text.slice(1);
    expect(await decryptKey(`${version}:${flip(iv)}:${sealed}`, FAMILY, s)).toBeNull();
    expect(await decryptKey(`${version}:${iv}:${flip(sealed)}`, FAMILY, s)).toBeNull();
  });

  it('does not open under another secret', async () => {
    expect(await decryptKey(await encryptKey(KEY, FAMILY, await secret(1)), FAMILY, await secret(2))).toBeNull();
  });

  it('refuses unknown versions and malformed text', async () => {
    const s = await secret();
    const [, iv, sealed] = (await encryptKey(KEY, FAMILY, s)).split(':') as [string, string, string];
    for (const bad of [`v2:${iv}:${sealed}`, `v1:${iv}`, `v1:${iv}:${sealed}:x`, 'garbage', '', `v1:!!:${sealed}`]) {
      expect(await decryptKey(bad, FAMILY, s)).toBeNull();
    }
  });

  it('refuses a secret that is missing or not 32 bytes', async () => {
    expect(await importSecret(undefined)).toBeNull();
    expect(await importSecret('')).toBeNull();
    expect(await importSecret(btoa('too short'))).toBeNull();
    expect(await importSecret('not base64 at all!')).toBeNull();
  });
});
