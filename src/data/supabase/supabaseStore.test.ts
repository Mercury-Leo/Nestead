// @vitest-environment node
//
// Not jsdom. The realtime client opens a WebSocket, and jsdom's Event class is
// not Node's, so undici throws "The 'event' argument must be an instance of
// Event" when it dispatches the open event. Nothing here touches the DOM, so
// node is both correct and the only environment where realtime can connect.

import { describe, it } from 'vitest';
import { runDataStoreContract } from '../collection.contract';
import { createSupabaseStore } from './supabaseStore';
import { signInTester } from './supabaseTestSession';
import type { DataStore } from '../types';

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

/** Built once and reused: signing in on every case would be needlessly slow. */
const stores = new Map<string, DataStore>();

async function storeFor(label: string): Promise<DataStore> {
  const cached = stores.get(label);
  if (cached !== undefined) return cached;

  const credentials = label === 'family-a' ? config.a : config.b;
  const session = await signInTester(
    label,
    config.url as string,
    config.anonKey as string,
    credentials.email as string,
    credentials.password as string,
  );
  const store = createSupabaseStore(session.familyId, session.client);
  stores.set(label, store);
  return store;
}

/**
 * Tasks reference columns with ON DELETE RESTRICT, so tasks go first.
 *
 * Retried, because this family is not necessarily ours alone: the app open in
 * a browser on the same account is a real client, and a task appearing between
 * the two loops makes the column delete fail on the foreign key. Deleting the
 * tasks again and retrying is enough, and failing loudly after three attempts
 * beats leaving the next case to start from a dirty board.
 */
async function clear(store: DataStore): Promise<void> {
  for (const collection of [store.listItems, store.listGroups, store.recipes, store.pantry, store.dietProfiles] as const) {
    for (const row of await collection.list()) await collection.remove(row.id);
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    for (const task of await store.tasks.list()) await store.tasks.remove(task.id);

    const blocked: string[] = [];
    for (const column of await store.columns.list()) {
      try {
        await store.columns.remove(column.id);
      } catch (error) {
        blocked.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (blocked.length === 0) return;
    if (attempt === 3) throw new Error(`could not clear columns: ${blocked[0]}`);
  }
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
