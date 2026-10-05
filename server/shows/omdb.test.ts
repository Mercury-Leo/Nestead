// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createShowsHandler, omdbProvider, parseGenres, parsePoster, parseRating, parseReleased, parseRuntime, parseYear, present, toDetails, toHits } from '.';

const KEY = 'omdb-test-key';
const POSTER = 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg';

/** OMDb's answer for Inception, as `i=tt1375666&plot=short` gives it. */
const INCEPTION = {
  Title: 'Inception',
  Year: '2010',
  Rated: 'PG-13',
  Released: '16 Jul 2010',
  Runtime: '148 min',
  Genre: 'Action, Adventure, Sci-Fi',
  Plot: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.',
  Poster: POSTER,
  imdbRating: '8.8',
  imdbVotes: '2,600,000',
  imdbID: 'tt1375666',
  Type: 'movie',
  Response: 'True',
};

const BREAKING_BAD = {
  Title: 'Breaking Bad',
  Year: '2008–2013',
  Released: '20 Jan 2008',
  Runtime: '49 min',
  Plot: 'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine.',
  Poster: 'N/A',
  imdbRating: '9.5',
  imdbID: 'tt0903747',
  Type: 'series',
  totalSeasons: '5',
  Response: 'True',
};

function get(query: string): Request {
  return new Request(`http://localhost/api/shows?${query}`);
}

/** A stand-in for OMDb that answers every call with this body and status. */
function omdb(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

/** /api/shows with OMDb behind it, as provider.ts chooses it. */
function handler(fetchMock: typeof fetch, timeoutMs?: number) {
  return createShowsHandler({ provider: omdbProvider({ apiKey: KEY, fetch: fetchMock }), timeoutMs });
}

/** The OMDb URL the provider asked for. */
function asked(fetchMock: ReturnType<typeof omdb>): URL {
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

describe('normalising OMDb', () => {
  it('reads "N/A" and blanks as absent', () => {
    expect(present('N/A')).toBeUndefined();
    expect(present('  ')).toBeUndefined();
    expect(present(undefined)).toBeUndefined();
    expect(present(' Inception ')).toBe('Inception');
  });

  it('reads runtimes as minutes', () => {
    expect(parseRuntime('148 min')).toBe(148);
    expect(parseRuntime('1 h 30 min')).toBe(90);
    expect(parseRuntime('2h')).toBe(120);
    expect(parseRuntime('N/A')).toBeUndefined();
    expect(parseRuntime('0 min')).toBeUndefined();
    expect(parseRuntime('long')).toBeUndefined();
  });

  it('reads the first year of a range', () => {
    expect(parseYear('2010')).toBe(2010);
    expect(parseYear('2008–2013')).toBe(2008);
    expect(parseYear('2019–')).toBe(2019);
    expect(parseYear('N/A')).toBeUndefined();
  });

  it('reads Released as an ISO date, falling back to the year', () => {
    expect(parseReleased('16 Jul 2010', '2010')).toBe('2010-07-16');
    expect(parseReleased('1 Jan 2008', '2008–2013')).toBe('2008-01-01');
    expect(parseReleased('N/A', '2027')).toBe('2027-01-01');
    expect(parseReleased('N/A', '2008–2013')).toBe('2008-01-01');
    // A day the month does not have is not a date.
    expect(parseReleased('31 Feb 2010', '2010')).toBe('2010-01-01');
    expect(parseReleased('N/A', 'N/A')).toBeUndefined();
  });

  it('reads ratings as numbers from 0 to 10', () => {
    expect(parseRating('8.8')).toBe(8.8);
    expect(parseRating('10.0')).toBe(10);
    expect(parseRating('N/A')).toBeUndefined();
    expect(parseRating('11')).toBeUndefined();
    expect(parseRating('-1')).toBeUndefined();
  });

  it('keeps https posters and never an img.omdbapi.com one', () => {
    expect(parsePoster(POSTER)).toBe(POSTER);
    expect(parsePoster('N/A')).toBeUndefined();
    expect(parsePoster('http://m.media-amazon.com/x.jpg')).toBeUndefined();
    expect(parsePoster(`https://img.omdbapi.com/?apikey=${KEY}&i=tt1375666`)).toBeUndefined();
    expect(parsePoster('javascript:alert(1)')).toBeUndefined();
  });

  it('reads Genre as a list, each once, at most ten', () => {
    expect(parseGenres('Action, Comedy, Crime')).toEqual(['Action', 'Comedy', 'Crime']);
    expect(parseGenres(' Sci-Fi ,, Drama, drama ')).toEqual(['Sci-Fi', 'Drama']);
    expect(parseGenres('N/A')).toBeUndefined();
    expect(parseGenres(' , ')).toBeUndefined();
    expect(parseGenres(undefined)).toBeUndefined();
    const many = Array.from({ length: 14 }, (_, i) => `Genre ${i}`).join(', ');
    expect(parseGenres(many)).toHaveLength(10);
    expect(parseGenres('x'.repeat(60))?.[0]).toHaveLength(40);
  });

  it('turns a movie into ShowDetails', () => {
    expect(toDetails(INCEPTION)).toEqual({
      imdbId: 'tt1375666',
      kind: 'movie',
      title: 'Inception',
      plot: INCEPTION.Plot,
      posterUrl: POSTER,
      released: '2010-07-16',
      year: 2010,
      runtimeMin: 148,
      imdbRating: 8.8,
      genres: ['Action', 'Adventure', 'Sci-Fi'],
    });
  });

  it('keeps totalSeasons for a series, and leaves out what OMDb lacks', () => {
    const details = toDetails(BREAKING_BAD);
    expect(details).toEqual({
      imdbId: 'tt0903747',
      kind: 'series',
      title: 'Breaking Bad',
      plot: BREAKING_BAD.Plot,
      released: '2008-01-20',
      year: 2008,
      runtimeMin: 49,
      totalSeasons: 5,
      imdbRating: 9.5,
    });
    expect(details).not.toHaveProperty('posterUrl');
    expect(details).not.toHaveProperty('genres');
    // A movie never carries seasons, whatever OMDb sends.
    expect(toDetails({ ...INCEPTION, totalSeasons: '3' })).not.toHaveProperty('totalSeasons');
  });

  it('drops episodes, games and rows without an id or a title', () => {
    expect(toDetails({ ...INCEPTION, Type: 'episode' })).toBeUndefined();
    expect(toDetails({ ...INCEPTION, Type: 'game' })).toBeUndefined();
    expect(toDetails({ ...INCEPTION, imdbID: 'nm0000138' })).toBeUndefined();
    expect(toDetails({ ...INCEPTION, Title: 'N/A' })).toBeUndefined();
  });

  it('lists movies and series from a search, each once', () => {
    const hits = toHits([
      { Title: 'Inception', Year: '2010', imdbID: 'tt1375666', Type: 'movie', Poster: POSTER },
      { Title: 'Inception', Year: '2010', imdbID: 'tt1375666', Type: 'movie', Poster: POSTER },
      { Title: 'Inception: The Cobol Job', Year: '2010', imdbID: 'tt5295894', Type: 'episode', Poster: 'N/A' },
      { Title: 'Inception: The Game', Year: '2011', imdbID: 'tt1757456', Type: 'game', Poster: 'N/A' },
      { Title: 'Breaking Bad', Year: '2008–2013', imdbID: 'tt0903747', Type: 'series', Poster: 'N/A' },
    ]);
    expect(hits).toEqual([
      { imdbId: 'tt1375666', title: 'Inception', year: 2010, kind: 'movie', posterUrl: POSTER },
      { imdbId: 'tt0903747', title: 'Breaking Bad', year: 2008, kind: 'series' },
    ]);
    expect(toHits(undefined)).toEqual([]);
  });
});

describe('OMDb behind /api/shows', () => {
  it('searches OMDb with s= and the type, and answers hits', async () => {
    const fetchMock = omdb({ Search: [{ Title: 'Inception', Year: '2010', imdbID: 'tt1375666', Type: 'movie', Poster: POSTER }], totalResults: '1', Response: 'True' });
    const response = await handler(fetchMock)(get('q=%20inception%20&type=movie'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [{ imdbId: 'tt1375666', title: 'Inception', year: 2010, kind: 'movie', posterUrl: POSTER }] });
    expect(response.headers.get('cache-control')).toBe('private, max-age=600');
    const url = asked(fetchMock);
    expect(url.origin + url.pathname).toBe('https://www.omdbapi.com/');
    expect(url.searchParams.get('s')).toBe('inception');
    expect(url.searchParams.get('type')).toBe('movie');
    expect(url.searchParams.get('apikey')).toBe(KEY);
  });

  it('searches every kind when no type is given', async () => {
    const fetchMock = omdb({ Search: [], Response: 'True' });
    await handler(fetchMock)(get('q=office'));
    expect(asked(fetchMock).searchParams.has('type')).toBe(false);
  });

  it('answers an empty list when OMDb finds nothing, or too much', async () => {
    for (const error of ['Movie not found!', 'Series not found!', 'Too many results.']) {
      const response = await handler(omdb({ Response: 'False', Error: error }))(get('q=a'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ results: [] });
    }
  });

  it('reads one title with i= and the short plot', async () => {
    const fetchMock = omdb(INCEPTION);
    const response = await handler(fetchMock)(get('id=tt1375666'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ show: toDetails(INCEPTION) });
    const url = asked(fetchMock);
    expect(url.searchParams.get('i')).toBe('tt1375666');
    expect(url.searchParams.get('plot')).toBe('short');
    expect(url.searchParams.has('s')).toBe(false);
  });

  it('answers not-found for an unknown id, an episode, or a different title', async () => {
    const cases: unknown[] = [
      { Response: 'False', Error: 'Incorrect IMDb ID.' },
      { Response: 'False', Error: 'Error getting data.' },
      { ...INCEPTION, Type: 'episode' },
      { ...INCEPTION, imdbID: 'tt0903747' },
    ];
    const statuses: number[] = [];
    for (const body of cases) {
      const response = await handler(omdb(body))(get('id=tt1375666'));
      statuses.push(response.status);
    }
    // "Error getting data." is OMDb failing, not the title missing.
    expect(statuses).toEqual([404, 502, 404, 404]);
  });

  it('refuses a bad question before calling OMDb', async () => {
    const fetchMock = omdb(INCEPTION);
    const shows = handler(fetchMock);
    for (const query of ['', 'q=', 'q=%20%20', `q=${'a'.repeat(201)}`, 'q=office&type=episode', 'id=nm0000138', 'id=tt1', 'id=tt1375666&q=x']) {
      const response = await shows(get(query));
      expect(response.status, query).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-query' });
    }
    expect((await shows(new Request('http://localhost/api/shows?q=x', { method: 'POST', body: '{}' }))).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not configured without a key, and never calls OMDb', async () => {
    const fetchMock = omdb(INCEPTION);
    for (const apiKey of [undefined, '', '  ']) {
      const response = await createShowsHandler({ provider: omdbProvider({ apiKey, fetch: fetchMock }) })(get('q=inception'));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'not-configured' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps OMDb's errors to its own, without passing the key or OMDb's text on", async () => {
    const cases: [unknown, number, string, number][] = [
      [{ Response: 'False', Error: 'Invalid API key!' }, 401, 'not-configured', 503],
      [{ Response: 'False', Error: 'No API key provided.' }, 401, 'not-configured', 503],
      [{ Response: 'False', Error: 'Request limit reached!' }, 401, 'limit', 429],
      [{ Response: 'False', Error: `Something odd happened for ${KEY}` }, 200, 'failed', 502],
      ['<html>Unauthorized</html>', 401, 'not-configured', 503],
      ['Too Many Requests', 429, 'limit', 429],
      ['<html>Bad gateway</html>', 502, 'failed', 502],
      ['not json at all', 200, 'failed', 502],
    ];
    for (const [body, upstream, error, status] of cases) {
      for (const query of ['q=inception', 'id=tt1375666']) {
        const response = await handler(omdb(body, upstream))(get(query));
        expect(response.status, `${String(upstream)} ${query}`).toBe(status);
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ error });
        expect(text).not.toContain(KEY);
        expect(text.toLowerCase()).not.toContain('invalid api key');
        expect(text).not.toContain('Something odd');
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    }
  });

  it('never puts the key in a successful answer either', async () => {
    const poster = `https://img.omdbapi.com/?apikey=${KEY}&i=tt1375666`;
    const search = await handler(omdb({ Search: [{ Title: 'Inception', Year: '2010', imdbID: 'tt1375666', Type: 'movie', Poster: poster }], Response: 'True' }))(get('q=inception'));
    expect(await search.text()).not.toContain(KEY);
    const details = await handler(omdb({ ...INCEPTION, Poster: poster }))(get('id=tt1375666'));
    expect(await details.text()).not.toContain(KEY);
  });

  it('fails when the request to OMDb does', async () => {
    const broken = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const response = await handler(broken)(get('q=inception'));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'failed' });
  });

  /** OMDb never answering, until the handler gives up. */
  const silent = () =>
    vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

  it('stops waiting for OMDb at the timeout', async () => {
    const response = await handler(silent(), 20)(get('id=tt1375666'));
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'timeout' });
  });
});
