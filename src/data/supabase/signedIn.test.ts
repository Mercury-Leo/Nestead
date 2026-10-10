import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAccount } from './supabaseAccount';
import { createSupabaseStore } from './supabaseStore';

/** PostgREST's Max Rows: no answer holds more, whatever was asked for. */
const MAX_ROWS = 1000;

/**
 * Without a session supabase-js sends the publishable key instead, and RLS
 * answers with no rows and no error. These run against a stand-in client, so
 * they need no project.
 */
function fakeClient() {
  const state = {
    session: { access_token: 'token' } as object | null,
    listError: null as { message: string } | null,
    requests: [] as string[],
    joined: null as ((status: string) => void) | null,
    /** What every table holds, in id order. */
    rows: [] as Array<Record<string, unknown>>,
    /** The pages read asked for: order column and range. */
    pages: [] as string[],
  };
  const answer = (from: number, to: number) =>
    state.listError === null
      ? { data: state.rows.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null }
      : { data: null, error: state.listError };
  const refreshSession = vi.fn(async () => ({ data: {}, error: null }));
  const channel = {
    on: () => channel,
    subscribe: (callback: (status: string) => void) => {
      state.joined = callback;
      return channel;
    },
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: state.session }, error: null }), refreshSession },
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          state.requests.push(`read ${table}`);
          // Awaited as it is, a read gets the first MAX_ROWS rows and no more;
          // members is read with maybeSingle(), the tables a page at a time.
          return Object.assign(Promise.resolve(answer(0, Infinity)), {
            maybeSingle: async () => ({ data: null, error: null }),
            order: (column: string) => ({
              range: async (from: number, to: number) => {
                state.pages.push(`${column} ${from}-${to}`);
                return answer(from, to);
              },
            }),
          });
        },
      }),
      delete: () => ({
        eq: () => ({
          eq: async () => {
            state.requests.push(`delete ${table}`);
            return { error: null };
          },
        }),
      }),
    }),
    channel: () => channel,
    removeChannel: async () => 'ok',
  };
  return { client: client as unknown as SupabaseClient, state, refreshSession };
}

describe('the Supabase adapter without a session', () => {
  it('refuses to read rows, and asks the database nothing', async () => {
    const { client, state } = fakeClient();
    state.session = null;
    const store = createSupabaseStore('f', client);
    await expect(store.listItems.list()).rejects.toThrow('Not signed in');
    expect(state.requests).toEqual([]);
  });

  it('refuses to delete, which would otherwise match nothing and still succeed', async () => {
    const { client, state } = fakeClient();
    state.session = null;
    const store = createSupabaseStore('f', client);
    await expect(store.listItems.remove('item')).rejects.toThrow('Not signed in');
    expect(state.requests).toEqual([]);
  });

  it('refuses to read membership, rather than answer "in no family"', async () => {
    const { client, state } = fakeClient();
    state.session = null;
    await expect(createSupabaseAccount(client).readMembership('u')).rejects.toThrow('Not signed in');
    expect(state.requests).toEqual([]);
  });

  it('reads as usual with one', async () => {
    const { client, state } = fakeClient();
    await expect(createSupabaseStore('f', client).listItems.list()).resolves.toEqual([]);
    expect(state.requests).toEqual(['read list_items']);
  });
});

describe('the Supabase adapter', () => {
  it('refreshes the session when the server says the token has expired', async () => {
    const { client, state, refreshSession } = fakeClient();
    const store = createSupabaseStore('f', client);

    state.listError = { message: 'permission denied for table list_items' };
    await expect(store.listItems.list()).rejects.toThrow();
    expect(refreshSession).not.toHaveBeenCalled();

    state.listError = { message: 'JWT expired' };
    await expect(store.listItems.list()).rejects.toThrow('JWT expired');
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('reads every row past the 1000 a request returns, a page at a time', async () => {
    const { client, state } = fakeClient();
    state.rows = Array.from({ length: 2500 }, (_, index) => ({ id: `e-${String(index).padStart(4, '0')}`, family_id: 'f', task_id: 't', title: 'Bins' }));

    const rows = await createSupabaseStore('f', client).taskCompletions.list();

    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2500);
    expect(state.pages).toEqual(['id 0-999', 'id 1000-1999', 'id 2000-2999']);
  });

  it('stops after a short first page', async () => {
    const { client, state } = fakeClient();
    state.rows = [{ id: 'e-1', family_id: 'f', task_id: 't', title: 'Bins' }];

    expect(await createSupabaseStore('f', client).taskCompletions.list()).toEqual([{ id: 'e-1', familyId: 'f', taskId: 't', title: 'Bins' }]);
    expect(state.pages).toEqual(['id 0-999']);
  });

  it('reads again when its realtime channel joins again, not when it first joins', () => {
    const { client, state } = fakeClient();
    const store = createSupabaseStore('f', client);
    const onChange = vi.fn();
    store.listItems.subscribe(onChange);

    state.joined?.('SUBSCRIBED');
    expect(onChange).not.toHaveBeenCalled();
    state.joined?.('CHANNEL_ERROR');
    state.joined?.('SUBSCRIBED');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
