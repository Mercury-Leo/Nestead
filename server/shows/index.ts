/**
 * Movies and series for the Shows page, from OMDb (https://www.omdbapi.com).
 *
 * Framework-agnostic like ../search: `(request: Request) => Promise<Response>`,
 * run as a Cloudflare Pages Function (functions/api/shows.ts) and as Vite
 * middleware (vite.config.ts). It only searches, and reads one title's details;
 * the app saves those details as a row, so opening the list never calls OMDb.
 *
 * The API key stays on the server (OMDB_API_KEY). A VITE_* name would put it in
 * the public bundle, and so would img.omdbapi.com posters, which need it in the
 * URL: posters are only ever OMDb's links to Amazon's image servers.
 */

export { createShowsHandler, parseKind, parsePoster, parseRating, parseReleased, parseRuntime, parseYear, present, toDetails, toHits } from './handler';
export type { ShowDetails, ShowHit, ShowKind, ShowsError, ShowsOptions } from './types';
