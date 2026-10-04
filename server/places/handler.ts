import { PlacesProviderError } from './types';
import type { AddressQuery, PlacesError, PlacesOptions } from './types';

const TIMEOUT_MS = 5_000;
const MIN_QUERY = 3;
const MAX_QUERY = 200;
const LIMIT = 6;

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

const STATUS: Record<PlacesError, number> = {
  'invalid-query': 400,
  limit: 429,
  'places-failed': 502,
  timeout: 504,
};

function fail(error: PlacesError): Response {
  return json({ error }, STATUS[error]);
}

const HEBREW = /[֐-׿]/;

/** The query a provider is given: Hebrew text asks for local names, anything else for English. */
export function planQuery(text: string): AddressQuery {
  return { text, language: HEBREW.test(text) ? 'he' : 'en', limit: LIMIT };
}

/**
 * GET /api/places?q=… answers { results: AddressSuggestion[], attribution? }. Which service
 * answers is the provider's business (provider.ts); this checks the query,
 * times the provider out and maps its failures to statuses.
 */
export function createPlacesHandler(options: PlacesOptions): (request: Request) => Promise<Response> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  return async (request) => {
    if (request.method !== 'GET') return json({ error: 'method' }, 405);
    const text = (new URL(request.url).searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < MIN_QUERY || text.length > MAX_QUERY) return fail('invalid-query');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const results = await options.provider.suggest(planQuery(text), controller.signal);
      const { attribution } = options.provider;
      // Addresses rarely move: the browser may reuse an answer for a day.
      return json(attribution === undefined ? { results } : { results, attribution }, 200, 'private, max-age=86400');
    } catch (error) {
      if (controller.signal.aborted) return fail('timeout');
      if (error instanceof PlacesProviderError) return fail(error.code);
      return fail('places-failed');
    } finally {
      clearTimeout(timer);
    }
  };
}
