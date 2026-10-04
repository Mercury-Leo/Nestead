import type { ShowDetails, ShowHit, ShowKind, ShowsError } from '../../../../server/shows';

/**
 * The browser's side of /api/shows (server/shows). Called only to search when
 * adding a show, to read the chosen result, and to refresh one show someone
 * asked for: the list itself reads saved rows, never OMDb.
 *
 * `unavailable` means this build has no OMDb: the endpoint is missing (a static
 * host, the demo build) or the server has no key.
 */
export type ShowsFailure = 'unavailable' | 'limit' | 'not-found' | 'failed';

export type ShowsAnswer<T> = { ok: true; value: T } | { ok: false; failure: ShowsFailure };

async function ask(query: URLSearchParams): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; failure: ShowsFailure }> {
  let response: Response;
  try {
    response = await fetch(`/api/shows?${query.toString()}`, { headers: { accept: 'application/json' } });
  } catch {
    return { ok: false, failure: 'failed' };
  }
  // Without the endpoint, the host answers with the app's own page.
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body !== 'object') return { ok: false, failure: 'unavailable' };
  const error = body.error as ShowsError | undefined;
  if (error === undefined) return { ok: true, body };
  if (error === 'not-configured') return { ok: false, failure: 'unavailable' };
  if (error === 'limit' || error === 'not-found') return { ok: false, failure: error };
  return { ok: false, failure: 'failed' };
}

/** Up to ten movies and series by name. `kind` narrows the search to one of them. */
export async function searchShows(query: string, kind?: ShowKind): Promise<ShowsAnswer<ShowHit[]>> {
  const params = new URLSearchParams({ q: query });
  if (kind !== undefined) params.set('type', kind);
  const answer = await ask(params);
  if (!answer.ok) return answer;
  return Array.isArray(answer.body.results) ? { ok: true, value: answer.body.results as ShowHit[] } : { ok: false, failure: 'failed' };
}

/** One title's details, with OMDb's short plot. */
export async function lookupShow(imdbId: string): Promise<ShowsAnswer<ShowDetails>> {
  const answer = await ask(new URLSearchParams({ id: imdbId }));
  if (!answer.ok) return answer;
  const show = answer.body.show as ShowDetails | undefined;
  return typeof show === 'object' && show !== null && show.imdbId === imdbId ? { ok: true, value: show } : { ok: false, failure: 'failed' };
}
