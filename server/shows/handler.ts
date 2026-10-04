import { IMDB_ID, ShowsProviderError } from './types';
import type { ShowKind, ShowsError, ShowsOptions } from './types';

const TIMEOUT_MS = 8_000;
const MAX_QUERY = 200;
/** A search answers at most ten, whatever the service sends. */
const MAX_HITS = 10;

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

/** An answer the browser may keep for ten minutes: searching again or reopening a result costs nothing. */
function answer(body: unknown): Response {
  return json(body, 200, 'private, max-age=600');
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
  const type = params.get('type');
  if (type === null || type === '') return { kind: 'search', query };
  return type === 'movie' || type === 'series' ? { kind: 'search', query, type } : undefined;
}

/**
 * GET `?q=…&type=movie|series` searches and answers `{ results: ShowHit[] }`;
 * GET `?id=tt…` reads one title and answers `{ show: ShowDetails }`. Errors
 * answer `{ error: ShowsError }`. Which service answers is the provider's
 * business (provider.ts); this checks the question, times the provider out
 * and maps its failures to statuses, so nothing the service says beyond its
 * normalised answer, a key least of all, reaches a response.
 */
export function createShowsHandler(options: ShowsOptions): (request: Request) => Promise<Response> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  return async (request) => {
    if (request.method !== 'GET') return json({ error: 'method' }, 405);
    const ask = readAsk(new URL(request.url));
    if (ask === undefined) return fail('invalid-query');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (ask.kind === 'search') {
        const search = ask.type === undefined ? { query: ask.query } : { query: ask.query, kind: ask.type };
        const results = await options.provider.search(search, controller.signal);
        return answer({ results: results.slice(0, MAX_HITS) });
      }
      const show = await options.provider.details(ask.id, controller.signal);
      // The asked-for id must be the one answered.
      if (show === undefined || show.imdbId !== ask.id) return fail('not-found');
      return answer({ show });
    } catch (error) {
      if (controller.signal.aborted) return fail('timeout');
      return fail(error instanceof ShowsProviderError ? error.code : 'failed');
    } finally {
      clearTimeout(timer);
    }
  };
}
