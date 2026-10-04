import type { ShowDetails, ShowHit, ShowKind, ShowsError, ShowsOptions } from './types';

const OMDB = 'https://www.omdbapi.com/';
const TIMEOUT_MS = 8_000;
const MAX_QUERY = 200;
/** OMDb's first page holds ten; that is all a search asks for. */
const MAX_HITS = 10;
const MAX_TITLE = 300;
const MAX_PLOT = 1_000;
const IMDB_ID = /^tt\d{7,10}$/;

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

const STATUS: Record<ShowsError, number> = {
  'invalid-query': 400,
  'not-found': 404,
  limit: 429,
  failed: 502,
  'not-configured': 503,
  timeout: 504,
};

function fail(error: ShowsError): Response {
  return json({ error }, STATUS[error]);
}

/** OMDb writes "N/A" for anything it lacks; that, and blanks, are absent here. */
export function present(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text === '' || text === 'N/A' ? undefined : text;
}

/** "148 min" is 148; "1 h 30 min" is 90. */
export function parseRuntime(value: unknown): number | undefined {
  const text = present(value);
  if (text === undefined) return undefined;
  const hours = /(\d+)\s*h/i.exec(text);
  const minutes = /(\d+)\s*min/i.exec(text);
  if (hours === null && minutes === null) return undefined;
  const total = Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0);
  return total > 0 ? total : undefined;
}

/** The first year: "2010", "2008–2013" and "2019–" are 2010, 2008 and 2019. */
export function parseYear(value: unknown): number | undefined {
  const match = /^(\d{4})/.exec(present(value) ?? '');
  return match === null ? undefined : Number(match[1]);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * `Released` ("16 Jul 2010") as an ISO date. Without one, 1 January of `Year`,
 * so a title can still sort by release; without either, nothing.
 */
export function parseReleased(released: unknown, year: unknown): string | undefined {
  const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(present(released) ?? '');
  if (match !== null) {
    const month = MONTHS.indexOf((match[2] as string).toLowerCase()) + 1;
    const day = Number(match[1]);
    const date = new Date(Date.UTC(Number(match[3]), month - 1, day));
    // A day the month does not have (31 Feb) rolls over in Date; refuse it instead.
    if (month > 0 && date.getUTCDate() === day) return date.toISOString().slice(0, 10);
  }
  const first = parseYear(year);
  return first === undefined ? undefined : `${first}-01-01`;
}

/** imdbRating "8.8" is 8.8; anything outside 0 to 10 is dropped. */
export function parseRating(value: unknown): number | undefined {
  const text = present(value);
  if (text === undefined || !/^\d+(\.\d+)?$/.test(text)) return undefined;
  const rating = Number(text);
  return rating <= 10 ? rating : undefined;
}

function parseCount(value: unknown): number | undefined {
  const text = present(value);
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const count = Number(text);
  return count > 0 ? count : undefined;
}

/** Movies and series only: OMDb also lists episodes and games. */
export function parseKind(value: unknown): ShowKind | undefined {
  return value === 'movie' || value === 'series' ? value : undefined;
}

/**
 * An https poster on an image host. img.omdbapi.com is refused: it only answers
 * with the key in the URL, and the key never leaves the server.
 */
export function parsePoster(value: unknown): string | undefined {
  const text = present(value);
  if (text === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  const host = url.hostname.toLowerCase();
  if (host === 'omdbapi.com' || host.endsWith('.omdbapi.com')) return undefined;
  return url.toString();
}

function parseTitle(value: unknown): string | undefined {
  return present(value)?.slice(0, MAX_TITLE);
}

/** OMDb's `Search` list as hits: movies and series with an IMDb id and a title, each once. */
export function toHits(search: unknown): ShowHit[] {
  if (!Array.isArray(search)) return [];
  const hits: ShowHit[] = [];
  const seen = new Set<string>();
  for (const result of search) {
    if (typeof result !== 'object' || result === null) continue;
    const row = result as Record<string, unknown>;
    const imdbId = typeof row.imdbID === 'string' ? row.imdbID : '';
    const kind = parseKind(row.Type);
    const title = parseTitle(row.Title);
    if (!IMDB_ID.test(imdbId) || kind === undefined || title === undefined || seen.has(imdbId)) continue;
    seen.add(imdbId);
    const hit: ShowHit = { imdbId, title, kind };
    const year = parseYear(row.Year);
    if (year !== undefined) hit.year = year;
    const posterUrl = parsePoster(row.Poster);
    if (posterUrl !== undefined) hit.posterUrl = posterUrl;
    hits.push(hit);
    if (hits.length === MAX_HITS) break;
  }
  return hits;
}

/** One OMDb title as ShowDetails, or undefined if it is not a movie or series with an id and a title. */
export function toDetails(body: unknown): ShowDetails | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const row = body as Record<string, unknown>;
  const imdbId = typeof row.imdbID === 'string' ? row.imdbID : '';
  const kind = parseKind(row.Type);
  const title = parseTitle(row.Title);
  if (!IMDB_ID.test(imdbId) || kind === undefined || title === undefined) return undefined;

  const details: ShowDetails = { imdbId, kind, title };
  const optional: Omit<ShowDetails, 'imdbId' | 'kind' | 'title'> = {
    plot: present(row.Plot)?.slice(0, MAX_PLOT),
    posterUrl: parsePoster(row.Poster),
    released: parseReleased(row.Released, row.Year),
    year: parseYear(row.Year),
    runtimeMin: parseRuntime(row.Runtime),
    totalSeasons: kind === 'series' ? parseCount(row.totalSeasons) : undefined,
    imdbRating: parseRating(row.imdbRating),
  };
  // Absent, not undefined, so the JSON and the tests see the same shape.
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (details as unknown as Record<string, unknown>)[key] = value;
  }
  return details;
}

/** What an OMDb `"Response": "False"` means. Its text is only read here, never passed on. */
function omdbError(message: unknown, lookingUp: boolean): ShowsError | 'none' {
  const text = typeof message === 'string' ? message.toLowerCase() : '';
  if (text.includes('limit')) return 'limit';
  if (text.includes('api key')) return 'not-configured';
  // A search that finds nothing, or too much to list ("a"), is an empty list.
  if (/not found|too many results|incorrect imdb id/.test(text)) return lookingUp ? 'not-found' : 'none';
  return 'failed';
}

type Ask = { kind: 'search'; query: string; type?: ShowKind } | { kind: 'details'; id: string };

/** The request's question, or undefined if it asks nothing valid. */
function readAsk(url: URL): Ask | undefined {
  const params = url.searchParams;
  const id = params.get('id');
  const rawQuery = params.get('q');
  if (id !== null) return rawQuery === null && IMDB_ID.test(id) ? { kind: 'details', id } : undefined;
  const query = (rawQuery ?? '').replace(/\s+/g, ' ').trim();
  if (query === '' || query.length > MAX_QUERY) return undefined;
  const rawType = params.get('type');
  if (rawType === null || rawType === '') return { kind: 'search', query };
  const type = parseKind(rawType);
  return type === undefined ? undefined : { kind: 'search', query, type };
}

/**
 * GET `?q=…&type=movie|series` searches OMDb (`s=`) and answers `{ results:
 * ShowHit[] }`; GET `?id=tt…` reads one title (`i=…&plot=short`) and answers
 * `{ show: ShowDetails }`. Errors answer `{ error: ShowsError }` and never carry
 * the key or OMDb's own text.
 */
export function createShowsHandler(options: ShowsOptions = {}): (request: Request) => Promise<Response> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  return async (request) => {
    if (request.method !== 'GET') return json({ error: 'method' }, 405);
    const ask = readAsk(new URL(request.url));
    if (ask === undefined) return fail('invalid-query');
    const apiKey = options.apiKey?.trim() ?? '';
    if (apiKey === '') return fail('not-configured');

    const omdb = new URL(OMDB);
    omdb.searchParams.set('apikey', apiKey);
    if (ask.kind === 'search') {
      omdb.searchParams.set('s', ask.query);
      if (ask.type !== undefined) omdb.searchParams.set('type', ask.type);
    } else {
      omdb.searchParams.set('i', ask.id);
      omdb.searchParams.set('plot', 'short');
    }
    const lookingUp = ask.kind === 'details';

    const doFetch = options.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(omdb.toString(), { signal: controller.signal, headers: { accept: 'application/json' } });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      // OMDb answers 401 both for a bad key and for the day's allowance used up; its text tells them apart.
      if (body !== null && typeof body === 'object' && body.Response === 'False') {
        const error = omdbError(body.Error, lookingUp);
        return error === 'none' ? json({ results: [] }, 200, 'private, max-age=600') : fail(error);
      }
      if (response.status === 401 || response.status === 403) return fail('not-configured');
      if (response.status === 429) return fail('limit');
      if (!response.ok || body === null || typeof body !== 'object') return fail('failed');

      if (ask.kind === 'search') return json({ results: toHits(body.Search) }, 200, 'private, max-age=600');
      const show = toDetails(body);
      // An episode or a game has an id but is not a show; the asked-for id must be the one answered.
      if (show === undefined || show.imdbId !== ask.id) return fail('not-found');
      return json({ show }, 200, 'private, max-age=600');
    } catch {
      return fail(controller.signal.aborted ? 'timeout' : 'failed');
    } finally {
      clearTimeout(timer);
    }
  };
}
