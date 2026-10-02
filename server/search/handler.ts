import { ENGLISH_SITES, HEBREW_SITES } from './sites';
import type { RecipeSite } from './sites';
import type { SearchError, SearchOptions, WebRecipeHit } from './types';

const TAVILY = 'https://api.tavily.com/search';
const TIMEOUT_MS = 8_000;
const MAX_QUERY = 200;
/** Asked for. Fewer come back once pages that are not single recipes are dropped. */
const ASK_FOR = 20;
const MAX_HITS = 12;

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

const STATUS: Record<SearchError, number> = {
  'invalid-query': 400,
  'not-configured': 503,
  limit: 429,
  'search-failed': 502,
  timeout: 504,
};

function fail(error: SearchError): Response {
  return json({ error }, STATUS[error]);
}

const HEBREW = /[֐-׿]/;

/**
 * Where to look and what to ask: a query with Hebrew letters goes to the Hebrew
 * sites, anything else to the English ones, with the word for "recipe" added
 * unless it is already there.
 */
export function planSearch(query: string): { sites: readonly RecipeSite[]; query: string } {
  if (HEBREW.test(query)) return { sites: HEBREW_SITES, query: query.includes('מתכו') ? query : `מתכון ${query}` };
  return { sites: ENGLISH_SITES, query: /\brecipes?\b/i.test(query) ? query : `${query} recipe` };
}

function siteFor(url: URL, sites: readonly RecipeSite[]): RecipeSite | undefined {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return sites.find((site) => host === site.domain || host.endsWith(`.${site.domain}`));
}

const SEPARATORS = [' | ', ' - ', ' – ', ' — '];

/** Latin letters and digits only, for comparing the end of a title with a site's domain. */
function nameKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A page title as a list of results should show it: without the "מתכון:" label
 * in front, and without the site's own name at the end ("Banana Bread Recipe -
 * Love and Lemons"), since the site is shown under it. Tavily's text from each
 * page is left out altogether: it is a chunk of the page (steps, breadcrumbs, a
 * cookie notice), not a description.
 */
export function cleanTitle(title: string, site: RecipeSite): string {
  let text = title.replace(/\s+/g, ' ').trim().replace(/^מתכון\s*:\s*/, '');
  const cut = Math.max(...SEPARATORS.map((separator) => text.lastIndexOf(separator)));
  if (cut > 0) {
    const tail = text.slice(cut + 3).trim();
    const key = nameKey(tail);
    const domain = nameKey(site.domain.replace(/\.(com|co\.il|co\.uk)$/, ''));
    const named = key.length >= 3 && (domain.includes(key) || key.includes(domain));
    if (named || site.brands?.includes(tail) === true) text = text.slice(0, cut).trim();
  }
  return text;
}

/** The first https image among a result's images, given as URLs or as { url }. */
function imageOf(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  for (const image of images) {
    const src = typeof image === 'string' ? image : typeof image === 'object' && image !== null ? (image as { url?: unknown }).url : undefined;
    if (typeof src === 'string' && src.startsWith('https://')) return src;
  }
  return undefined;
}

/** Tavily's results as hits: single recipe pages on the given sites, each once. */
export function toHits(results: unknown, sites: readonly RecipeSite[]): WebRecipeHit[] {
  if (!Array.isArray(results)) return [];
  const hits: WebRecipeHit[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (typeof result !== 'object' || result === null) continue;
    const { url: rawUrl, title: rawTitle, images } = result as Record<string, unknown>;
    let url: URL;
    try {
      url = new URL(String(rawUrl));
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    const site = siteFor(url, sites);
    if (site === undefined || !site.recipePage.test(url.pathname)) continue;
    const title = typeof rawTitle === 'string' ? cleanTitle(rawTitle, site) : '';
    if (title === '') continue;

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const key = `${host}${url.pathname.replace(/\/$/, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);

    url.hash = '';
    const hit: WebRecipeHit = { url: url.toString(), site: host, title };
    const image = imageOf(images);
    if (image !== undefined) hit.image = image;
    hits.push(hit);
    if (hits.length === MAX_HITS) break;
  }
  return hits;
}

export function createSearchHandler(options: SearchOptions = {}): (request: Request) => Promise<Response> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  return async (request) => {
    if (request.method !== 'GET') return json({ error: 'method' }, 405);
    const query = (new URL(request.url).searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim();
    if (query === '' || query.length > MAX_QUERY) return fail('invalid-query');
    const apiKey = options.apiKey?.trim() ?? '';
    if (apiKey === '') return fail('not-configured');

    const plan = planSearch(query);
    const doFetch = options.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(TAVILY, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          query: plan.query,
          search_depth: 'basic',
          max_results: ASK_FOR,
          include_domains: plan.sites.map((site) => site.domain),
          include_images: true,
        }),
      });
      // A refused key is a setup problem, like a missing one.
      if (response.status === 401 || response.status === 403) return fail('not-configured');
      // 429 is too many at once; 432 and 433 are the plan's allowance used up.
      if (response.status === 429 || response.status === 432 || response.status === 433) return fail('limit');
      if (!response.ok) return fail('search-failed');
      const body = (await response.json()) as { results?: unknown };
      return json({ results: toHits(body.results, plan.sites) }, 200, 'private, max-age=600');
    } catch {
      return fail(controller.signal.aborted ? 'timeout' : 'search-failed');
    } finally {
      clearTimeout(timer);
    }
  };
}
