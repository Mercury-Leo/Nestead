import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Signing in a test user, shared by the contract and realtime suites.
 *
 * These talk to a real hosted service, so calls fail occasionally for reasons
 * that have nothing to do with the code: a sub-second clock difference between
 * Supabase's auth and API servers produces "JWT issued at future", and requests
 * time out. Those are retried.
 *
 * Every error is checked. An earlier version of the realtime helper ignored the
 * error field from the membership query, so a transient failure arrived as
 * "Cannot read properties of null", which says nothing about what went wrong.
 */

const ATTEMPTS = 3;

/** Worth another go: transient, and not a sign the code is wrong. */
function isTransient(message: string): boolean {
  return /issued at future|timeout|timed out|fetch failed|network|503|504|Too Many/i.test(message);
}

async function retry<T>(what: string, run: () => Promise<T>): Promise<T> {
  let last = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      if (!isTransient(last) || attempt === ATTEMPTS) {
        throw new Error(`${what}: ${last}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw new Error(`${what}: ${last}`);
}

export interface TestSession {
  client: SupabaseClient;
  userId: string;
  familyId: string;
}

/**
 * Signs in and returns the family that user belongs to, creating one on first
 * use so a fresh pair of test accounts needs no manual setup.
 *
 * @param label Which family this stands for, used in messages and as the name
 *              of the family it creates.
 */
export async function signInTester(
  label: string,
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<TestSession> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = await retry(`${label}: sign in`, async () => {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error !== null) throw new Error(error.message);
    return data.user.id;
  });

  // Filtered by id: RLS returns every member of the family, so an unfiltered
  // lookup breaks as soon as a family has two people in it.
  const existing = await retry(`${label}: read membership`, async () => {
    const { data, error } = await client
      .from('members')
      .select('family_id')
      .eq('id', userId)
      .maybeSingle();
    if (error !== null) throw new Error(error.message);
    return (data?.family_id ?? null) as string | null;
  });

  if (existing !== null) return { client, userId, familyId: existing };

  const familyId = await retry(`${label}: create family`, async () => {
    const { data, error } = await client.rpc('create_family', {
      family_name: `Contract test ${label}`,
      display_name: `Test ${label}`,
    });
    if (error !== null) throw new Error(error.message);
    return (data as { id: string }).id;
  });

  return { client, userId, familyId };
}
