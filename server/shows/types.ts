/** The shapes /api/shows sends, and the provider behind it. The app reads the shapes too, as types only. */

/** Movies and series only: a service's episodes and games are dropped. */
export type ShowKind = 'movie' | 'series';

/** IMDb's id is the app's key for a title, whichever service answers: "tt1375666". */
export const IMDB_ID = /^tt\d{7,10}$/;

/** One search result. Its details are read, by `?id=`, only once it is chosen. */
export interface ShowHit {
  /** IMDb's id, "tt1375666". */
  imdbId: string;
  title: string;
  /** The first year: a series running "2008–2013" is 2008. */
  year?: number;
  kind: ShowKind;
  /** An https image that needs no key, so the browser can load it. */
  posterUrl?: string;
}

/** One title, normalised: what the service lacks is absent, numbers are numbers. */
export interface ShowDetails {
  imdbId: string;
  kind: ShowKind;
  title: string;
  /** A short plot, written for a card. */
  plot?: string;
  posterUrl?: string;
  /** ISO date, YYYY-MM-DD: the release date, or 1 January of the year when the service has no date. */
  released?: string;
  year?: number;
  /** A movie's running time, or one episode's for a series. */
  runtimeMin?: number;
  /** Series only. */
  totalSeasons?: number;
  /** 0 to 10. */
  imdbRating?: number;
  /** In English, as the service names them ("Action", "Sci-Fi"), each once: at most ten, each under 40 characters. */
  genres?: string[];
}

export type ShowsError = 'invalid-query' | 'not-configured' | 'limit' | 'not-found' | 'failed' | 'timeout';

/** What a provider throws when it cannot answer. Its message is the code, never the service's text. */
export class ShowsProviderError extends Error {
  constructor(readonly code: 'not-configured' | 'limit' | 'failed') {
    super(code);
  }
}

/** One search: a name, already trimmed, and optionally one kind. */
export interface ShowsSearch {
  query: string;
  kind?: ShowKind;
}

/**
 * A movies-and-series service. The handler checks the question, times the
 * provider out (`signal`) and turns its answers into responses; the provider
 * only asks its service and normalises the answer: movies and series with an
 * IMDb id and a title, each once, absent fields left out, titles under 300
 * characters and plots under 1,000, posters https and free of any key, genres
 * in English with IMDb's names (the app translates those), at most ten. It
 * throws `ShowsProviderError` for what the app should hear about, and nothing
 * it throws ever reaches a response. Chosen in `provider.ts`.
 */
export interface ShowsProvider {
  /** Movies and series by name; empty when the service finds none, or too many to list. */
  search(search: ShowsSearch, signal: AbortSignal): Promise<ShowHit[]>;
  /** One title with a short plot, or undefined when the service has no movie or series by that id. */
  details(imdbId: string, signal: AbortSignal): Promise<ShowDetails | undefined>;
}

export interface ShowsOptions {
  provider: ShowsProvider;
  timeoutMs?: number;
}
