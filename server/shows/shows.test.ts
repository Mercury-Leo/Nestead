// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShowsHandler, defaultShowsProvider, ShowsProviderError } from '.';
import type { ShowDetails, ShowHit, ShowsProvider, ShowsSearch } from '.';

const INCEPTION: ShowDetails = { imdbId: 'tt1375666', kind: 'movie', title: 'Inception', year: 2010, runtimeMin: 148 };
const HIT: ShowHit = { imdbId: 'tt1375666', title: 'Inception', year: 2010, kind: 'movie' };

function get(query: string): Request {
  return new Request(`http://localhost/api/shows?${query}`);
}

/** A provider that answers what it is told, and records what it was asked. */
function fake(answers: { search?: () => Promise<ShowHit[]>; details?: () => Promise<ShowDetails | undefined> } = {}) {
  const asked: (ShowsSearch | string)[] = [];
  const provider: ShowsProvider & { asked: typeof asked } = {
    asked,
    async search(search) {
      asked.push(search);
      return (answers.search ?? (async () => [HIT]))();
    },
    async details(imdbId) {
      asked.push(imdbId);
      return (answers.details ?? (async () => INCEPTION))();
    },
  };
  return provider;
}

/** A provider that never answers, until the handler gives up. */
function silent(): ShowsProvider {
  const wait = (_ask: unknown, signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  return { search: wait, details: wait };
}

describe('createShowsHandler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers the provider's hits, asked with the trimmed name and the kind", async () => {
    const provider = fake();
    const response = await createShowsHandler({ provider })(get('q=%20%20the%20%20office%20&type=series'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [HIT] });
    expect(response.headers.get('cache-control')).toBe('private, max-age=600');
    expect(provider.asked).toEqual([{ query: 'the office', kind: 'series' }]);
    await createShowsHandler({ provider })(get('q=office&type='));
    expect(provider.asked[1]).toEqual({ query: 'office' });
  });

  it('answers at most ten hits, whatever the provider sends', async () => {
    const many = Array.from({ length: 14 }, (_, i): ShowHit => ({ imdbId: `tt${String(1000000 + i)}`, title: `Film ${i}`, kind: 'movie' }));
    const response = await createShowsHandler({ provider: fake({ search: async () => many }) })(get('q=film'));
    expect(((await response.json()) as { results: ShowHit[] }).results).toEqual(many.slice(0, 10));
  });

  it("answers one title's details", async () => {
    const provider = fake();
    const response = await createShowsHandler({ provider })(get('id=tt1375666'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ show: INCEPTION });
    expect(response.headers.get('cache-control')).toBe('private, max-age=600');
    expect(provider.asked).toEqual(['tt1375666']);
  });

  it('answers not-found when the provider has no such title, or answers about another', async () => {
    for (const details of [async () => undefined, async () => ({ ...INCEPTION, imdbId: 'tt0903747' })]) {
      const response = await createShowsHandler({ provider: fake({ details }) })(get('id=tt1375666'));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not-found' });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('refuses a bad question before asking the provider', async () => {
    const provider = fake();
    const handler = createShowsHandler({ provider });
    for (const query of ['', 'q=', 'q=%20%20', `q=${'a'.repeat(201)}`, 'q=office&type=episode', 'id=nm0000138', 'id=tt1', 'id=tt1375666&q=x']) {
      const response = await handler(get(query));
      expect(response.status, query).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-query' });
    }
    expect((await handler(new Request('http://localhost/api/shows?q=x', { method: 'POST', body: '{}' }))).status).toBe(405);
    expect(provider.asked).toEqual([]);
  });

  it("maps the provider's failures to statuses, uncached, and passes nothing else on", async () => {
    const cases: [unknown, string, number][] = [
      [new ShowsProviderError('not-configured'), 'not-configured', 503],
      [new ShowsProviderError('limit'), 'limit', 429],
      [new ShowsProviderError('failed'), 'failed', 502],
      [new Error('upstream said: secret-key-123'), 'failed', 502],
      ['a string', 'failed', 502],
    ];
    for (const [thrown, error, status] of cases) {
      const fails = async () => {
        throw thrown;
      };
      for (const query of ['q=inception', 'id=tt1375666']) {
        const response = await createShowsHandler({ provider: fake({ search: fails, details: fails }) })(get(query));
        expect(response.status, `${error} ${query}`).toBe(status);
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ error });
        expect(text).not.toContain('secret-key-123');
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    }
  });

  it('gives up after the timeout, and waits 8 seconds by default', async () => {
    const quick = await createShowsHandler({ provider: silent(), timeoutMs: 20 })(get('id=tt1375666'));
    expect(quick.status).toBe(504);
    expect(await quick.json()).toEqual({ error: 'timeout' });

    vi.useFakeTimers();
    try {
      let settled = false;
      const pending = createShowsHandler({ provider: silent() })(get('q=inception')).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(7_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).status).toBe(504);
    } finally {
      vi.useRealTimers();
    }
  });

  it("chooses OMDb with the server's OMDB_API_KEY", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json({ Search: [], Response: 'True' }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = createShowsHandler({ provider: defaultShowsProvider({ OMDB_API_KEY: 'from-env' }) });
    expect((await handler(get('q=inception'))).status).toBe(200);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://www.omdbapi.com');
    expect(url.searchParams.get('apikey')).toBe('from-env');

    const unset = await createShowsHandler({ provider: defaultShowsProvider({}) })(get('q=inception'));
    expect(await unset.json()).toEqual({ error: 'not-configured' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
