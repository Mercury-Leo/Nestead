/**
 * Recipe search: find recipe pages on the web for "Search online".
 *
 * Framework-agnostic like ../import: `(request: Request) => Promise<Response>`,
 * run as a Cloudflare Pages Function (functions/api/search.ts) and as Vite
 * middleware (vite.config.ts). It asks Tavily's search API, limited to recipe
 * sites the importer can read (sites.ts), in English or Hebrew by the query.
 *
 * It returns links, not recipes: the page a person picks is read by
 * /api/import, exactly as a pasted link is.
 *
 * The API key stays on the server (TAVILY_API_KEY). A VITE_* name would put it
 * in the public bundle.
 */

export { cleanTitle, createSearchHandler, planSearch, toHits } from './handler';
export { ENGLISH_SITES, HEBREW_SITES } from './sites';
export type { RecipeSite } from './sites';
export type { SearchError, SearchOptions, WebRecipeHit } from './types';
