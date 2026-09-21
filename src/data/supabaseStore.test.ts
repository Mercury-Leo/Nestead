// @vitest-environment node
//
// Not jsdom. The realtime client opens a WebSocket, and jsdom's Event class is
// not Node's, so undici throws "The 'event' argument must be an instance of
// Event" when it dispatches the open event. Nothing here touches the DOM, so
// node is both correct and the only environment where realtime can connect.

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, it } from 'vitest';
import { runDataStoreContract } from './collection.contract';
import { createSupabaseStore } from './supabaseStore';
import type { DataStore } from './types';

/**
 * Runs the contract against a real Supabase project.
 *
 * This needs two signed-in users in two different families, because RLS means
 * a client cannot simply assert a family id the way the local backend can.
 *
 * Credentials come from a gitignored .env.test; see .env.test.example. When it
 * is absent the suite skips rather than fails, so `npm test` stays green for
 * anyone who has not set it up.
 *
 * Use throwaway accounts. These are test fixtures, and the suite deletes every
 * task and column in both families between cases.
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

/** Signs in, and makes sure that user belongs to a family. */
async function signIn(
  label: string,
  credentials: { email: string; password: string },
): Promise<DataStore> {
  const client: SupabaseClient = createClient(config.url as string, config.anonKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await client.auth.signInWithPassword(credentials);
  if (authError !== null) {
    throw new Error(`${label}: could not sign in (${authError.message})`);
  }

  // First run bootstraps the family. create_family() refuses a second time, so
  // later runs fall through to the existing membership.
  const existing = await client.from('members').select('family_id').maybeSingle();
  if (existing.error !== null) {
    throw new Error(`${label}: could not read membership (${existing.error.message})`);
  }

  let familyId = existing.data?.family_id as string | undefined;
  if (familyId === undefined) {
    const created = await client.rpc('create_family', {
      family_name: `Contract test ${label}`,
      display_name: `Test ${label}`,
    });
    if (created.error !== null) {
      throw new Error(`${label}: create_family failed (${created.error.message})`);
    }
    familyId = (created.data as { id: string }).id;
  }

  return createSupabaseStore(familyId, client);
}

/** Built once and reused: signing in on every case would be needlessly slow. */
const stores = new Map<string, DataStore>();

async function storeFor(label: string): Promise<DataStore> {
  const cached = stores.get(label);
  if (cached !== undefined) return cached;

  const credentials = label === 'family-a' ? config.a : config.b;
  const store = await signIn(label, {
    email: credentials.email as string,
    password: credentials.password as string,
  });
  stores.set(label, store);
  return store;
}

/** Tasks reference columns with ON DELETE RESTRICT, so tasks go first. */
async function clear(store: DataStore): Promise<void> {
  for (const task of await store.tasks.list()) await store.tasks.remove(task.id);
  for (const column of await store.columns.list()) await store.columns.remove(column.id);
}

if (!configured) {
  describe('DataStore contract: supabase', () => {
    it.skip('skipped: .env.test is not set up (see .env.test.example)', () => {
      // Intentionally empty.
    });
  });
} else {
  // Both stores are built eagerly rather than only the ones already cached.
  // family-b's store is otherwise first created inside the last case, so its
  // rows survive the run and the next one starts dirty.
  runDataStoreContract('supabase', storeFor, async () => {
    for (const label of ['family-a', 'family-b']) {
      await clear(await storeFor(label));
    }
  });
}
