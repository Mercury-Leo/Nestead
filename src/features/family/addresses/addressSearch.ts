import type { AddressSuggestion } from '../../../../server/places';

export type { AddressSuggestion };

export interface Suggestions {
  results: AddressSuggestion[];
  /** The data's credit, from whichever service answered; shown under the list. */
  attribution?: string;
}

const NONE: Suggestions = { results: [] };

/**
 * Address suggestions from /api/places (server/places). Which service answers
 * is the server's choice; this knows only the app's own route. Any failure
 * (no endpoint in the demo build, the service down or throttling) is no
 * suggestions: typing the address by hand always works. An abort still
 * rejects, so a stale answer is never shown.
 */
export async function suggestAddresses(text: string, signal: AbortSignal): Promise<Suggestions> {
  let response: Response;
  try {
    response = await fetch(`/api/places?q=${encodeURIComponent(text)}`, { signal, headers: { accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return NONE;
  }
  if (!response.ok) return NONE;
  const body = (await response.json().catch(() => null)) as { results?: unknown; attribution?: unknown } | null;
  if (body === null || !Array.isArray(body.results)) return NONE;
  const results = body.results.filter(
    (row): row is AddressSuggestion =>
      typeof row === 'object' && row !== null && typeof (row as AddressSuggestion).street === 'string' && typeof (row as AddressSuggestion).city === 'string',
  );
  return typeof body.attribution === 'string' ? { results, attribution: body.attribution } : { results };
}
