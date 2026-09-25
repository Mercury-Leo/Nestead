// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { signInTester } from './supabaseTestSession';
import type { TestSession } from './supabaseTestSession';

/**
 * rotate_join_code() against a real Supabase project, with the same gitignored
 * .env.test as the contract suite. Skips when that is not set up.
 *
 * It rotates family-a's code for real. Harmless for throwaway test accounts:
 * nobody is meant to join them by code.
 */

const env = import.meta.env;

const config = {
  url: env.SUPABASE_TEST_URL,
  anonKey: env.SUPABASE_TEST_ANON_KEY,
  a: { email: env.SUPABASE_TEST_A_EMAIL, password: env.SUPABASE_TEST_A_PASSWORD },
  b: { email: env.SUPABASE_TEST_B_EMAIL, password: env.SUPABASE_TEST_B_PASSWORD },
};

const configured =
  [config.url, config.anonKey, config.a.email, config.a.password, config.b.email, config.b.password]
    .every((value) => typeof value === 'string' && value !== '');

function signIn(label: 'family-a' | 'family-b'): Promise<TestSession> {
  const credentials = label === 'family-a' ? config.a : config.b;
  return signInTester(
    label,
    config.url as string,
    config.anonKey as string,
    credentials.email as string,
    credentials.password as string,
  );
}

async function readCode(session: TestSession): Promise<string> {
  const { data, error } = await session.client.from('families').select('join_code').eq('id', session.familyId).single();
  if (error !== null) throw new Error(error.message);
  return data.join_code as string;
}

if (!configured) {
  describe('join codes: supabase', () => {
    it.skip('skipped: .env.test is not set up (see .env.test.example)', () => {
      // Intentionally empty.
    });
  });
} else {
  describe('join codes: supabase', () => {
    it('rotate_join_code() replaces the stored code with a fresh one', async () => {
      const a = await signIn('family-a');
      const before = await readCode(a);

      const { data, error } = await a.client.rpc('rotate_join_code');
      expect(error).toBeNull();

      const rotated = data as string;
      expect(rotated).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(rotated).not.toBe(before);
      expect(await readCode(a)).toBe(rotated);
    });

    it('rotating one family leaves the other family alone and hidden', async () => {
      const a = await signIn('family-a');
      const b = await signIn('family-b');
      const bBefore = await readCode(b);

      const { data, error } = await a.client.rpc('rotate_join_code');
      expect(error).toBeNull();

      expect(await readCode(b)).toBe(bBefore);

      // RLS hides a's row from b, code or no code.
      const peek = await b.client.from('families').select('id').eq('join_code', data as string);
      expect(peek.error).toBeNull();
      expect(peek.data).toEqual([]);
    });
  });
}
