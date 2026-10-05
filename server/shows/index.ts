/**
 * Movies and series for the Shows page: search by name, and one title's details.
 *
 * Framework-agnostic like ../search: `(request: Request) => Promise<Response>`,
 * run as a Cloudflare Pages Function (functions/api/shows.ts) and as Vite
 * middleware (vite.config.ts). It only searches, and reads one title's details;
 * the app saves those details as a row, so opening the list never calls the
 * service. The service behind it is a ShowsProvider, chosen in provider.ts;
 * the browser only ever calls /api/shows.
 *
 * The service's key stays on the server: a VITE_* name would put it in the
 * public bundle.
 */

export { createShowsHandler } from './handler';
export { omdbProvider, parseGenres, parseKind, parsePoster, parseRating, parseReleased, parseRuntime, parseYear, present, toDetails, toHits } from './omdb';
export type { OmdbOptions } from './omdb';
export { defaultShowsProvider } from './provider';
export type { ShowsEnv } from './provider';
export { IMDB_ID, ShowsProviderError } from './types';
export type { ShowDetails, ShowHit, ShowKind, ShowsError, ShowsOptions, ShowsProvider, ShowsSearch } from './types';
