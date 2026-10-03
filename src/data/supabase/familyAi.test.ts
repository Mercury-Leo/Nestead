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

async function applied(session: TestSession): Promise<boolean> {
  const { error } = await session.client.rpc('family_ai_status');
  return error === null;
}

if (!configured) {
  describe('family AI settings: supabase', () => {
    it.skip('skipped: .env.test is not set up (see .env.test.example)', () => {
      // Intentionally empty.
    });
  });
} else {
  describe('family AI settings: supabase', () => {
    it('stores, shows, claims and clears a family key without spending a free read', async (ctx) => {
      const a = await signIn('family-a');
      if (!(await applied(a))) ctx.skip();

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
    });
  });
}
