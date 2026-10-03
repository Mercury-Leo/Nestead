// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createSupabaseAccount } from './supabaseAccount';
import { signInTester } from './supabaseTestSession';
import type { TestSession } from './supabaseTestSession';

/**
 * The AI settings functions against the real project with the .env.test
 * users. Those users live in PRODUCTION, so this suite only touches calls
 * that leave the free-read counter alone: it never claims without a family key
 * in place, which would spend the app's real free reads. Skips until the
 * family_ai migration is applied.
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

const FAKE = 'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBB';

/**
 * Whether an error from calling family_ai_status() says the function is not
 * there, i.e. the migration is not applied yet. Only that skips the live suite:
 * any other error (a function that raises, a user who lost their family, a
 * network failure) is a real failure and must show as one.
 *
 * A missing function reaches the client as PostgREST's PGRST202 or, worded
 * differently, "Could not find the function ...". 42883 (undefined_function)
 * counts only when it names family_ai_status itself: the same code from inside
 * the function, for a helper it calls, is a regression, not a missing migration.
 */
function migrationMissing(error: { code?: string; message?: string } | null): boolean {
  if (error === null) return false;
  const message = error.message ?? '';
  return (
    error.code === 'PGRST202' ||
    /could not find the function/i.test(message) ||
    (error.code === '42883' && /family_ai_status/.test(message))
  );
}

describe('migrationMissing', () => {
  it('is true when family_ai_status is not there', () => {
    expect(migrationMissing({ code: 'PGRST202', message: 'Could not find the function public.family_ai_status without parameters in the schema cache' })).toBe(true);
    expect(migrationMissing({ code: 'PGRST202', message: '' })).toBe(true);
    expect(migrationMissing({ code: '42883', message: 'function public.family_ai_status() does not exist' })).toBe(true);
    expect(migrationMissing({ message: 'Could not find the function public.family_ai_status' })).toBe(true);
  });

  it('is false for every other error, so it fails rather than skips', () => {
    expect(migrationMissing({ code: 'P0001', message: 'You do not belong to a family' })).toBe(false);
    expect(migrationMissing({ message: 'TypeError: fetch failed' })).toBe(false);
    expect(migrationMissing({ code: '', message: 'FetchError: request timed out' })).toBe(false);
    expect(migrationMissing({ code: '42501', message: 'permission denied for function family_ai_status' })).toBe(false);
    // The function exists but a helper it calls does not: a regression.
    expect(migrationMissing({ code: '42883', message: 'function current_family_id() does not exist' })).toBe(false);
  });

  it('is false when there is no error', () => {
    expect(migrationMissing(null)).toBe(false);
  });
});

if (!configured) {
  describe('family AI settings: supabase', () => {
    it.skip('skipped: .env.test is not set up (see .env.test.example)', () => {
      // Intentionally empty.
    });
  });
} else {
  describe('family AI settings: supabase', () => {
    // 30 s: a slow run must not be cut off before finally has removed the fake
    // key from the production family.
    it('stores, shows, claims and clears a family key without spending a free read', async (ctx) => {
      const a = await signIn('family-a');
      const status = await a.client.rpc('family_ai_status');
      if (migrationMissing(status.error)) ctx.skip();
      // Any other error is a real failure, not a skip. Its message only: an
      // error's details can carry a row.
      expect(status.error?.message ?? null).toBeNull();

      const account = createSupabaseAccount(a.client);
      try {
        // The key goes in before anything claims: with it in place a claim
        // hands the ciphertext back and counts nothing, but without one it
        // would spend one of the app's real free reads.
        const stored = await a.client.rpc('store_family_ai_key', { ciphertext: FAKE, hint: 'TEST' });
        expect(stored.error).toBeNull();

        expect((await account.aiStatus()).key?.hint).toBe('TEST');

        await account.setAiModel('google/gemini-2.5-flash');
        expect((await account.aiStatus()).key?.model).toBe('google/gemini-2.5-flash');

        const before = (await account.aiStatus()).free.used;

        const claim = await a.client.rpc('claim_ai_request');
        expect(claim.error).toBeNull();
        expect(claim.data).toEqual({
          mode: 'family',
          family_id: a.familyId,
          ciphertext: FAKE,
          model: 'google/gemini-2.5-flash',
        });
        expect((await account.aiStatus()).free.used).toBe(before);

        // No client reads these tables, whatever the family.
        for (const table of ['family_ai_settings', 'ai_usage']) {
          const peek = await a.client.from(table).select('*');
          expect(peek.error !== null ? [] : peek.data).toEqual([]);
        }
      } finally {
        await account.clearAiKey();
      }
    }, 30_000);
  });
}
