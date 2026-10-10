import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAccount } from './supabaseAccount';
import { createSupabaseStore } from './supabaseStore';

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
  };
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
          const answer = state.listError === null ? { data: [], error: null } : { data: null, error: state.listError };
          // The tables are awaited as they are; members is read with maybeSingle().
          return Object.assign(Promise.resolve(answer), { maybeSingle: async () => ({ data: null, error: null }) });
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
