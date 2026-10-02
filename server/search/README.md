# server/search
Recipe search for "Search online": find recipe pages on the web, in English or Hebrew, on sites the importer can read. One dependency-free `(Request) => Promise<Response>` handler.

## Files
| File | Responsibility |
| --- | --- |
| `index.ts` | The public surface: re-exports the handler, the site lists and types. |
| `handler.ts` | `createSearchHandler(options)`: GET `?q=`, one Tavily call, JSON out; `planSearch()` (sites and wording by language), `toHits()` (results to hits) and `cleanTitle()`. |
| `sites.ts` | `ENGLISH_SITES` and `HEBREW_SITES`: each site's domain, the path of a single recipe page, and for Hebrew sites the name that ends their titles. |
| `types.ts` | `WebRecipeHit`, `SearchError`, `SearchOptions`. |
| `search.test.ts` | Planning, filtering results, the request sent to Tavily, every error. |

## How it works
- Production: `../../functions/api/search.ts` is the Cloudflare Pages Function at `/api/search`; the key is the Pages secret `TAVILY_API_KEY`.
- Development and `vite preview`: `../../vite.config.ts` mounts `createSearchHandler()` at `/api/search`, with `TAVILY_API_KEY` from `.env.local`.
- A query with Hebrew letters searches `HEBREW_SITES` with "מתכון" added; any other searches `ENGLISH_SITES` with "recipe" added, unless the query has the word already (`planSearch()`).
- One Tavily call per search: basic depth (1 credit), 20 results asked for, `include_domains` set to the sites' domains, images asked for (`handler.ts`).
- `toHits()` keeps http(s) pages on a listed site whose path matches its `recipePage`, each once by host and path, up to 12, with the first https picture Tavily found on the page.
- `cleanTitle()` drops Mako's "מתכון:" label and the site's own name from the end of a title ("… | The Kitchn"), matched against the domain or, for Hebrew names, the site's `brands`; the site is shown under the title anyway.
- Tavily's text from each page is not passed on: it is a chunk of the page (steps, breadcrumbs, a cookie notice), not a description.
- Results are links. The page a person picks is read by `/api/import` (`../import/`), as a pasted link is.
- Error codes map to statuses: `invalid-query` 400 (empty, or over 200 characters), `not-configured` 503 (no key, or Tavily answered 401/403), `limit` 429 (Tavily 429, 432, 433), `search-failed` 502, `timeout` 504 (8 s); other methods get 405.
- A result may be cached by the browser for 10 minutes (`private, max-age=600`); errors are `no-store`.

## Connections
- Uses: web standards only (`fetch`, `URL`, `Response`), and Tavily's API at `https://api.tavily.com/search`.
- Used by: `../../functions/api/search.ts`, `../../vite.config.ts`, and, for types only, `../../src/features/larder/import/`.

## Rules & gotchas
- The key is server-only: `TAVILY_API_KEY`. A `VITE_*` name would inline it into the public bundle.
- Browser code imports only types from here (`import type`), as with `../import/`.
- A site goes in `sites.ts` only after the importer has read real recipe pages from it. Allrecipes, Serious Eats, Simply Recipes and EatingWell answer the importer with 402, Taste of Home with 403, so they are left out: their hits could never be imported.
- Tavily's free plan is 1,000 searches a month. Like `/api/import`, the endpoint is public, so anyone who finds it can spend the month's searches; on the free plan that stops search until the 1st, and bills nothing.
- Answers never include the key or Tavily's own error text.

## Tests
`search.test.ts`: English and Hebrew planning; filtering to single recipe pages, including percent-encoded Hebrew paths and Mako's nested sections; titles cleaned, on real titles from a live search; the cap of 12; the request sent to Tavily; each error, with the key never in a response.
