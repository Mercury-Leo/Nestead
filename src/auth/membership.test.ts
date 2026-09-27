// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { signInTester } from '../data/supabase/supabaseTestSession';
import { readFamily, readMembership } from './membership';

/**
 * readMembership() against a real Supabase project, with the same gitignored
 * .env.test as the contract suite. Skips when that is not set up.
 *
 * It reads the family through an embedded select, which depends on the
 * members -> families foreign key and on RLS letting a member see their own
 * family. Either changing would break sign-in, so it is checked for real.
 */

const env = import.meta.env;

const config = {
  url: env.SUPABASE_TEST_URL,
  anonKey: env.SUPABASE_TEST_ANON_KEY,
  email: env.SUPABASE_TEST_A_EMAIL,
  password: env.SUPABASE_TEST_A_PASSWORD,
};

const configured = Object.values(config).every((value) => typeof value === 'string' && value !== '');

describe('membership: supabase', () => {
  if (!configured) {
    it.skip('skipped: .env.test is not set up (see .env.test.example)', () => {
      // Intentionally empty.
    });
    return;
  }

  it('reads the family in one request, the same as reading it on its own', async () => {
    const session = await signInTester(
      'family-a',
      config.url as string,
      config.anonKey as string,
      config.email as string,
      config.password as string,
    );

    const family = await readMembership(session.client, session.userId);

    expect(family).toEqual(await readFamily(session.client, session.familyId));
  });

  it('is null for someone who is not a member', async () => {
    const session = await signInTester(
      'family-a',
      config.url as string,
      config.anonKey as string,
      config.email as string,
      config.password as string,
    );

    expect(await readMembership(session.client, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
