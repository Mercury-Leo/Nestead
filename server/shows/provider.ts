import { omdbProvider } from './omdb';
import type { ShowsProvider } from './types';

/** The server's settings, as far as Shows reads them: Cloudflare's `env`, or `.env.local` in Vite. */
export interface ShowsEnv {
  OMDB_API_KEY?: string;
}

/**
 * The movies-and-series service the app uses: the one place that names it.
 * functions/api/shows.ts and vite.config.ts both take it from here, so
 * swapping services is a new provider beside omdb.ts, its secret in
 * `ShowsEnv`, and this one line.
 */
export function defaultShowsProvider(env: ShowsEnv): ShowsProvider {
  return omdbProvider({ apiKey: env.OMDB_API_KEY });
}
