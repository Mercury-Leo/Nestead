import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupShow, searchShows } from './client';

function answer(body: string, status = 200, type = 'application/json') {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { status, headers: { 'content-type': type } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const HIT = { imdbId: 'tt1375666', title: 'Inception', year: 2010, kind: 'movie' };
const DETAILS = { ...HIT, plot: 'A thief who steals corporate secrets.', runtimeMin: 148, imdbRating: 8.8 };

describe('searchShows', () => {
  it('asks /api/shows by name, with the kind when given, and returns the hits', async () => {
    const fetchMock = answer(JSON.stringify({ results: [HIT] }));
    expect(await searchShows('Inception & co', 'movie')).toEqual({ ok: true, value: [HIT] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/shows?q=Inception+%26+co&type=movie`);
    await searchShows('office');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/shows?q=office');
  });

  it('is unavailable when the host has no endpoint, or the server no key', async () => {
    answer('<!doctype html><title>Nestead</title>', 200, 'text/html');
    expect(await searchShows('soup')).toEqual({ ok: false, failure: 'unavailable' });
    answer(JSON.stringify({ error: 'not-configured' }), 503);
    expect(await searchShows('soup')).toEqual({ ok: false, failure: 'unavailable' });
  });

  it("tells the day's limit from other failures", async () => {
    answer(JSON.stringify({ error: 'limit' }), 429);
    expect(await searchShows('x')).toEqual({ ok: false, failure: 'limit' });
    for (const [error, status] of [['failed', 502], ['timeout', 504], ['invalid-query', 400]] as const) {
      answer(JSON.stringify({ error }), status);
      expect(await searchShows('x')).toEqual({ ok: false, failure: 'failed' });
    }
  });

  it('fails when the request itself does', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await searchShows('x')).toEqual({ ok: false, failure: 'failed' });
  });
});

describe('lookupShow', () => {
  it('asks for one title by id', async () => {
    const fetchMock = answer(JSON.stringify({ show: DETAILS }));
    expect(await lookupShow('tt1375666')).toEqual({ ok: true, value: DETAILS });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/shows?id=tt1375666');
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBeUndefined();
  });

  it("skips the browser's cached answer for a refresh", async () => {
    const fetchMock = answer(JSON.stringify({ show: DETAILS }));
    await lookupShow('tt1375666', true);
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('says when the service has no such title', async () => {
    answer(JSON.stringify({ error: 'not-found' }), 404);
    expect(await lookupShow('tt1375666')).toEqual({ ok: false, failure: 'not-found' });
  });

  it('refuses an answer about another title', async () => {
    answer(JSON.stringify({ show: { ...DETAILS, imdbId: 'tt0903747' } }));
    expect(await lookupShow('tt1375666')).toEqual({ ok: false, failure: 'failed' });
  });
});
