import { IMDB_ID, ShowsProviderError } from './types';
import type { ShowDetails, ShowHit, ShowKind, ShowsProvider } from './types';

/*
 * OMDb (https://www.omdbapi.com): IMDb's titles by name (`s=`) or by id
 * (`i=`). The free key allows 1,000 requests a day; it goes in the query
 * string, so the URL sent to OMDb is never logged or returned.
 *
 * Posters are OMDb's links to Amazon's image servers. img.omdbapi.com is
 * refused: it only answers with the key in the URL (`parsePoster()`).
 */

const OMDB = 'https://www.omdbapi.com/';
const MAX_TITLE = 300;
const MAX_PLOT = 1_000;
const MAX_GENRES = 10;
const MAX_GENRE = 40;

export interface OmdbOptions {
  /** The OMDb API key, OMDB_API_KEY. Without one, every question throws `not-configured` before any request. */
  apiKey?: string;
  fetch?: typeof fetch;
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

/** `Genre` "Action, Comedy, Crime" as a list, each once, in OMDb's order; none is absent. */
export function parseGenres(value: unknown): string[] | undefined {
  const genres: string[] = [];
  const seen = new Set<string>();
  for (const part of (present(value) ?? '').split(',')) {
    const genre = present(part)?.slice(0, MAX_GENRE);
    if (genre === undefined || seen.has(genre.toLowerCase())) continue;
    seen.add(genre.toLowerCase());
    genres.push(genre);
    if (genres.length === MAX_GENRES) break;
  }
  return genres.length === 0 ? undefined : genres;
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
    genres: parseGenres(row.Genre),
  };
  // Absent, not undefined, so the JSON and the tests see the same shape.
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (details as unknown as Record<string, unknown>)[key] = value;
  }
  return details;
}

/** What an OMDb `"Response": "False"` means. Its text is only read here, never passed on. */
function omdbError(message: unknown): ShowsProviderError['code'] | 'none' {
  const text = typeof message === 'string' ? message.toLowerCase() : '';
  if (text.includes('limit')) return 'limit';
  if (text.includes('api key')) return 'not-configured';
  // A search that finds nothing, or too much to list ("a"), and an id OMDb does not know: no answer.
  if (/not found|too many results|incorrect imdb id/.test(text)) return 'none';
  return 'failed';
}

export function omdbProvider(options: OmdbOptions = {}): ShowsProvider {
  const apiKey = options.apiKey?.trim() ?? '';

  /** OMDb's answer to these parameters, or undefined when it has none. */
  async function ask(params: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown> | undefined> {
    if (apiKey === '') throw new ShowsProviderError('not-configured');
    const url = new URL(OMDB);
    url.searchParams.set('apikey', apiKey);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

    const doFetch = options.fetch ?? fetch;
    const response = await doFetch(url.toString(), { signal, headers: { accept: 'application/json' } });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    // OMDb answers 401 both for a bad key and for the day's allowance used up; its text tells them apart.
    if (body !== null && typeof body === 'object' && body.Response === 'False') {
      const error = omdbError(body.Error);
      if (error === 'none') return undefined;
      throw new ShowsProviderError(error);
    }
    if (response.status === 401 || response.status === 403) throw new ShowsProviderError('not-configured');
    if (response.status === 429) throw new ShowsProviderError('limit');
    if (!response.ok || body === null || typeof body !== 'object') throw new ShowsProviderError('failed');
    return body;
  }

  return {
    async search({ query, kind }, signal) {
      const body = await ask(kind === undefined ? { s: query } : { s: query, type: kind }, signal);
      return body === undefined ? [] : toHits(body.Search);
    },
    async details(imdbId, signal) {
      const body = await ask({ i: imdbId, plot: 'short' }, signal);
      return body === undefined ? undefined : toDetails(body);
    },
  };
}
