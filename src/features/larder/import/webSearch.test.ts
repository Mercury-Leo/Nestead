import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchOnline } from './webSearch';

function answer(body: string, status = 200, type = 'application/json') {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { status, headers: { 'content-type': type } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchOnline', () => {
  it('asks /api/search and returns the hits', async () => {
    const hit = { url: 'https://foody.co.il/foody_recipe/x/', site: 'foody.co.il', title: 'שניצל' };
    const fetchMock = answer(JSON.stringify({ results: [hit] }));
    expect(await searchOnline('שניצל & צ׳יפס')).toEqual({ kind: 'hits', hits: [hit] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/search?q=${encodeURIComponent('שניצל & צ׳יפס')}`);
  });

  it('is unavailable when the host has no endpoint and sends the app page back', async () => {
    answer('<!doctype html><title>Nestead</title>', 200, 'text/html');
    expect(await searchOnline('soup')).toEqual({ kind: 'unavailable' });
  });

  it('is unavailable when the server has no key', async () => {
    answer(JSON.stringify({ error: 'not-configured' }), 503);
    expect(await searchOnline('soup')).toEqual({ kind: 'unavailable' });
  });

  it('tells a used-up allowance from other failures', async () => {
    answer(JSON.stringify({ error: 'limit' }), 429);
    expect(await searchOnline('soup')).toEqual({ kind: 'failed', limit: true });
    answer(JSON.stringify({ error: 'search-failed' }), 502);
    expect(await searchOnline('soup')).toEqual({ kind: 'failed', limit: false });
    answer(JSON.stringify({ error: 'timeout' }), 504);
    expect(await searchOnline('soup')).toEqual({ kind: 'failed', limit: false });
  });

  it('fails when the request itself does', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await searchOnline('soup')).toEqual({ kind: 'failed', limit: false });
  });
});
