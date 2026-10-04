/** The shapes the OMDb proxy sends. The app reads all of them too, as types only. */

/** OMDb's `Type`, narrowed: episodes and games are dropped. */
export type ShowKind = 'movie' | 'series';

/** One search result. Its details are read, by `?id=`, only once it is chosen. */
export interface ShowHit {
  /** IMDb's id, "tt1375666". */
  imdbId: string;
  title: string;
  /** The first year: a series running "2008–2013" is 2008. */
  year?: number;
  kind: ShowKind;
  /** An https image on Amazon's servers, never img.omdbapi.com (that one needs the key). */
  posterUrl?: string;
}

/** One title, normalised: OMDb's "N/A" is absent, numbers are numbers. */
export interface ShowDetails {
  imdbId: string;
  kind: ShowKind;
  title: string;
  /** OMDb's short plot (`plot=short`), written for a card. */
  plot?: string;
  posterUrl?: string;
  /** ISO date, YYYY-MM-DD. From `Released`, or 1 January of `Year` when OMDb has no date. */
  released?: string;
  year?: number;
  runtimeMin?: number;
  /** Series only. */
  totalSeasons?: number;
  /** 0 to 10. */
  imdbRating?: number;
}

export type ShowsError = 'invalid-query' | 'not-configured' | 'limit' | 'not-found' | 'failed' | 'timeout';

export interface ShowsOptions {
  /** The OMDb API key. Without one, every request answers `not-configured`. */
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
