// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { StoreError, postgrestStore, toClaim } from './store';
import { strictFetch } from './testing';

const TOKEN = 'eyJmember.token.sig';
const reply = (body: unknown, status = 200): Response => new Response(body === undefined ? '' : JSON.stringify(body), { status });

function store(answer: Response | Error) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { fetch, store: postgrestStore({ url: 'https://proj.supabase.co/', key: 'sb_publishable_x', token: TOKEN, fetch, timeoutMs: 1000 }) };
}

describe('postgrestStore', () => {
  it('calls the RPC with the publishable key and the member\'s own token', async () => {
    const { fetch, store: s } = store(reply({ mode: 'free' }));
    expect(await s.claim()).toEqual({ mode: 'free' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/claim_ai_request');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_publishable_x');
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('sends the ciphertext and hint by name when storing', async () => {
    const { fetch, store: s } = store(reply(undefined, 200));
    expect(await s.storeKey('v1:aa:bb', 'a3f2')).toBeUndefined();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/store_family_ai_key');
    expect(JSON.parse(init.body as string)).toEqual({ ciphertext: 'v1:aa:bb', hint: 'a3f2' });
  });

  it('reads the family id, or null for someone in no family', async () => {
    expect(await store(reply('11111111-1111-4111-8111-111111111111')).store.familyId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(await store(reply(null)).store.familyId()).toBeNull();
  });

  it('answers unauthorized for a refused token', async () => {
    expect(await store(reply({ message: 'JWT expired' }, 401)).store.claim()).toBe('unauthorized');
    expect(await store(reply({}, 401)).store.familyId()).toBe('unauthorized');
    expect(await store(reply({}, 401)).store.storeKey('v1:a:b', 'abcd')).toBe('unauthorized');
  });

  it('throws StoreError for anything else, without the token in the message', async () => {
    for (const answer of [reply({}, 500), reply({}, 404), new TypeError('network')]) {
      const error = await store(answer).store.claim().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(StoreError);
      expect(String((error as Error).message)).not.toContain(TOKEN);
    }
  });

  it('calls fetch unbound so Illegal invocation does not throw on Workers and browsers', async () => {
    // strictFetch only works when called unbound (this === undefined)
    // If the code did options.fetch(...), this would be options and it would throw
    expect(await postgrestStore({ url: 'https://proj.supabase.co/', key: 'sb_publishable_x', token: TOKEN, fetch: strictFetch(() => reply({ mode: 'free' })), timeoutMs: 1000 }).claim()).toEqual({ mode: 'free' });
  });
});

describe('toClaim', () => {
  it('reads every answer claim_ai_request() gives', () => {
    expect(toClaim({ mode: 'no-family' })).toEqual({ mode: 'no-family' });
    expect(toClaim({ mode: 'free' })).toEqual({ mode: 'free' });
    expect(toClaim({ mode: 'quota-exceeded', scope: 'user' })).toEqual({ mode: 'quota-exceeded', scope: 'user' });
    expect(toClaim({ mode: 'family', family_id: 'f', ciphertext: 'v1:a:b', model: null })).toEqual({ mode: 'family', familyId: 'f', ciphertext: 'v1:a:b', model: null });
    expect(toClaim({ mode: 'family', family_id: 'f', ciphertext: 'v1:a:b', model: 'a/b' })).toMatchObject({ model: 'a/b' });
  });

  it('refuses anything else', () => {
    for (const body of [null, 'free', { mode: 'other' }, { mode: 'quota-exceeded', scope: 'all' }, { mode: 'family', family_id: 'f' }]) {
      expect(() => toClaim(body)).toThrow(StoreError);
    }
  });
});
