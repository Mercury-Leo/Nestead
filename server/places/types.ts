/** The shapes address search sends. The app reads AddressSuggestion and PlacesError too. */

/** One address a person can pick: the form's street and city fields, filled. */
export interface AddressSuggestion {
  /** Street and house number, as the form takes it: "Herzl 12". */
  street: string;
  city: string;
  /** The country, to tell apart two streets of the same name. */
  country?: string;
}

/** What a provider is asked. */
export interface AddressQuery {
  /** What the person typed: the street, and the city if they had filled it in. */
  text: string;
  /** Which language to name places in: 'he' when the text is Hebrew, else 'en'. */
  language: 'he' | 'en';
  /** At most this many suggestions. */
  limit: number;
}

/**
 * An address-search service. The handler (handler.ts) owns HTTP, checking the
 * query, timeouts and caching; a provider only turns a query into
 * suggestions. Swapping services is a new provider and one line in
 * provider.ts.
 *
 * A provider throws PlacesProviderError('limit') when the service says it is
 * being asked too often. Anything else it throws reads as `places-failed`.
 */
export interface AddressProvider {
  suggest(query: AddressQuery, signal: AbortSignal): Promise<AddressSuggestion[]>;
  /** The credit the service's data asks for, shown under its suggestions. */
  attribution?: string;
}

export class PlacesProviderError extends Error {
  constructor(readonly code: 'limit' | 'places-failed') {
    super(code);
  }
}

export type PlacesError = 'invalid-query' | 'limit' | 'places-failed' | 'timeout';

export interface PlacesOptions {
  provider: AddressProvider;
  timeoutMs?: number;
}
