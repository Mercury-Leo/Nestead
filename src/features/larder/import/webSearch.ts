import type { SearchError, WebRecipeHit } from '../../../../server/search';

/**
 * "Search online": what /api/search (server/search) says, sorted into what the
 * screen does next. `unavailable` means this build has no online search, either
 * because the endpoint is missing (a static host, the demo) or because it has
 * no key; the screen then searches the bundled index instead.
 */
export type OnlineSearch = { kind: 'hits'; hits: WebRecipeHit[] } | { kind: 'unavailable' } | { kind: 'failed'; limit: boolean };

export async function searchOnline(query: string): Promise<OnlineSearch> {
  let response: Response;
  try {
    response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { headers: { accept: 'application/json' } });
  } catch {
    return { kind: 'failed', limit: false };
  }
  // Without the endpoint, the host answers with the app's own page.
  const body = (await response.json().catch(() => null)) as { results?: unknown; error?: SearchError } | null;
  if (body === null || typeof body !== 'object') return { kind: 'unavailable' };
  if (Array.isArray(body.results)) return { kind: 'hits', hits: body.results as WebRecipeHit[] };
  if (body.error === 'not-configured') return { kind: 'unavailable' };
  return { kind: 'failed', limit: body.error === 'limit' };
}
