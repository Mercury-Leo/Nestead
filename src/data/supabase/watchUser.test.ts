import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import { createSupabaseAccount } from './supabaseAccount';
import { storedUserId } from './supabaseClient';

/**
 * Account.watchUser() over a stand-in client: who counts as signed in when a
 * launch cannot renew the session. No project needed.
 */
function fakeClient(answer: () => Promise<{ data: { session: Session | null }; error: Error | null }>) {
  let emit: (event: AuthChangeEvent, session: Session | null) => void = () => undefined;
  const client = {
    auth: {
      getSession: answer,
      onAuthStateChange: (callback: typeof emit) => {
        emit = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, emit: (event: AuthChangeEvent, session: Session | null) => emit(event, session) };
}

const session = (id: string): Session => ({ user: { id } }) as Session;

async function watch(client: SupabaseClient, stored: string | null): Promise<Array<string | null>> {
  const seen: Array<string | null> = [];
  createSupabaseAccount(client, () => stored).watchUser((userId) => seen.push(userId));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return seen;
}

describe('watchUser', () => {
  it('names the user of a session it could not renew for want of a connection', async () => {
    const { client } = fakeClient(async () => ({ data: { session: null }, error: new AuthRetryableFetchError('No answer within 8 s', 0) }));

    expect(await watch(client, 'user-1')).toEqual(['user-1']);
  });

  it('signs out when the server refused the session', async () => {
    const refused = new AuthApiError('Invalid Refresh Token: Already Used', 400, 'refresh_token_already_used');
    const { client } = fakeClient(async () => ({ data: { session: null }, error: refused }));

    expect(await watch(client, 'user-1')).toEqual([null]);
  });

  it('reports a fresh session, and signed out when nothing is stored', async () => {
    expect(await watch(fakeClient(async () => ({ data: { session: session('user-2') }, error: null })).client, 'user-2')).toEqual(['user-2']);
    expect(await watch(fakeClient(async () => ({ data: { session: null }, error: null })).client, null)).toEqual([null]);
  });

  it('ignores INITIAL_SESSION, which repeats the first answer as null while a refresh fails, but not later changes', async () => {
    const { client, emit } = fakeClient(async () => ({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) }));
    const seen = await watch(client, 'user-1');

    emit('INITIAL_SESSION', null);
    emit('TOKEN_REFRESHED', session('user-1'));
    emit('SIGNED_OUT', null);

    expect(seen).toEqual(['user-1', 'user-1', null]);
  });
});

describe('storedUserId', () => {
  const PROJECT = 'https://abcd.supabase.co';

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("reads the user from supabase-js's stored session, fresh or not", () => {
    localStorage.setItem('sb-abcd-auth-token', JSON.stringify({ access_token: 'expired', expires_at: 1, user: { id: 'user-1' } }));

    expect(storedUserId(PROJECT)).toBe('user-1');
  });

  it('is null with no session, or one it cannot read', () => {
    expect(storedUserId(PROJECT)).toBeNull();
    localStorage.setItem('sb-abcd-auth-token', '{not json');
    expect(storedUserId(PROJECT)).toBeNull();
    localStorage.setItem('sb-abcd-auth-token', 'null');
    expect(storedUserId(PROJECT)).toBeNull();
    expect(storedUserId(undefined)).toBeNull();
  });
});
