/** The shapes recipe search sends. The app reads WebRecipeHit and SearchError too. */

/** One recipe page the search found. It is read, by /api/import, only once chosen. */
export interface WebRecipeHit {
  url: string;
  /** The host without "www.", as the importer names it: "bbcgoodfood.com". */
  site: string;
  title: string;
  image?: string;
}

export type SearchError = 'invalid-query' | 'not-configured' | 'limit' | 'search-failed' | 'timeout';

export interface SearchOptions {
  /** The Tavily API key. Without one, every search answers `not-configured`. */
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
