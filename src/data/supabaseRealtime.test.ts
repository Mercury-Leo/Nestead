// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseStore } from './supabaseStore';

/**
 * Collection.subscribe() promises to fire for changes made by other tabs and
 * other clients. Nothing in the shared contract checks that, because the local
 * backend cannot demonstrate it: the storage event does not fire in the window
 * that wrote, and jsdom has only one window. So it is verified per backend,
 * here for Supabase and by hand in a real browser for localStorage.
 *
 * Both clients sign in as the same user, so they are two tabs of one person.
 * The writing store is a separate instance, so its local notify() cannot reach
 * the subscribing store: any notification must have arrived over realtime.
 *
 * Skips when .env.test is absent, like the contract run.
 */

const env = import.meta.env;
const url = env.SUPABASE_TEST_URL as string;
const key = env.SUPABASE_TEST_ANON_KEY as string;
const email = env.SUPABASE_TEST_A_EMAIL as string;
const password = env.SUPABASE_TEST_A_PASSWORD as string;

const configured = [url, key, email, password].every(
  (value) => typeof value === 'string' && value !== '',
);

async function connect() {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email, password });
  const { data } = await client.from('members').select('family_id').maybeSingle();
  return createSupabaseStore((data as { family_id: string }).family_id, client);
}

describe.skipIf(!configured)('supabase realtime', () => {
  it('delivers a change made by another client', async () => {
    const watcher = await connect();
    const writer = await connect();

    let changes = 0;
    const unsubscribe = watcher.tasks.subscribe(() => {
      changes += 1;
    });

    // Give the channel time to finish subscribing before writing.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const column = await writer.columns.create({
      name: 'Probe',
      position: 1000,
      isDone: false,
    });
    const task = await writer.tasks.create({
      title: 'Written by the other client',
      columnId: column.id,
      position: 1000,
      done: false,
    });

    const deadline = Date.now() + 10000;
    while (changes === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    unsubscribe();
    await writer.tasks.remove(task.id);
    await writer.columns.remove(column.id);

    expect(changes).toBeGreaterThan(0);
  }, 30000);
});
