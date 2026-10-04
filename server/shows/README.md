# server/shows
Movies and series for the Shows page, from OMDb: search by name, and one title's details. One dependency-free `(Request) => Promise<Response>` handler.

## Files
| File | Responsibility |
| --- | --- |
| `index.ts` | The public surface: re-exports the handler, the parsers and the types. |
| `handler.ts` | `createShowsHandler(options)`: GET `?q=&type=` (OMDb `s=`) or `?id=` (OMDb `i=…&plot=short`), JSON out; `toHits()`, `toDetails()` and the field parsers (`present()`, `parseRuntime()`, `parseReleased()`, `parseYear()`, `parseRating()`, `parseKind()`, `parsePoster()`). |
| `types.ts` | `ShowKind`, `ShowHit`, `ShowDetails`, `ShowsError`, `ShowsOptions`. |
| `shows.test.ts` | The parsers on real OMDb rows, the requests sent to OMDb, each error, the key never in a response, the 8 s timeout. |

## How it works
- Production: `../../functions/api/shows.ts` is the Cloudflare Pages Function at `/api/shows`; the key is the Pages secret `OMDB_API_KEY`.
- Development and `vite preview`: `../../vite.config.ts` mounts `createShowsHandler()` at `/api/shows`, with `OMDB_API_KEY` from `.env.local`.
- `?q=` (1 to 200 characters) and an optional `type=movie|series` make one OMDb search; the answer is `{ results: ShowHit[] }`, up to ten movies and series, each once. "Movie not found!" and "Too many results." are an empty list.
- `?id=tt…` reads one title with the short plot; the answer is `{ show: ShowDetails }`. An unknown id, an episode, a game, or an answer about another id is `not-found` (404).
- Normalising (`toDetails()`): OMDb's "N/A" and blanks are absent; `Runtime` "148 min" is 148; `Released` "16 Jul 2010" is `2010-07-16`, or 1 January of `Year` when OMDb has no date; `Year` "2008–2013" is 2008; `imdbRating` is a number from 0 to 10; `Type` is `movie` or `series`; `totalSeasons` is kept for series only. Titles stop at 300 characters and plots at 1,000.
- Posters are https links on Amazon's image servers, as OMDb gives them. `img.omdbapi.com` is refused (`parsePoster()`), since it only answers with the key in the URL.
- Error codes map to statuses: `invalid-query` 400 (no or bad `q`, `type` or `id`, or both `q` and `id`), `not-found` 404, `limit` 429 (OMDb's "Request limit reached!", or a 429), `failed` 502, `not-configured` 503 (no key, OMDb's "Invalid API key!", or a 401/403 without a body), `timeout` 504 (8 s); other methods get 405.
- OMDb answers 401 both for a bad key and for the day's limit, so its `Error` text decides between them (`omdbError()`); that text is read, never passed on.
- An answer may be cached by the browser for 10 minutes (`private, max-age=600`), so searching the same title again or reopening a result costs nothing; errors are `no-store`. The app's Refresh skips that copy (`cache: 'no-store'` in `../../src/features/activities/shows/omdb.ts`).

## Connections
- Uses: web standards only (`fetch`, `URL`, `Response`), and OMDb's API at `https://www.omdbapi.com/`.
- Used by: `../../functions/api/shows.ts`, `../../vite.config.ts`, and, for types only, `../../src/features/activities/shows/omdb.ts`.

## Rules & gotchas
- The key is server-only: `OMDB_API_KEY`. A `VITE_*` name would inline it into the public bundle. OMDb takes it in the query string, so the URL sent to OMDb is never logged or returned.
- Browser code imports only types from here (`import type`), as with `../search/`.
- OMDb's free key allows 1,000 requests a day. The app calls this only to search when adding a show, to read the chosen result, and when someone refreshes one show; the list reads saved rows (`../../src/features/activities/README.md`). The endpoint is public, so anyone who finds it can spend the day's requests; that stops adding shows until OMDb's reset, and bills nothing.
- Answers never include the key or OMDb's own error text.
- OMDb text is data: the app renders titles and plots as React text, never as HTML.

## Tests
`shows.test.ts`: "N/A", runtimes, years, release dates with the year fallback, ratings, posters (https only, never `img.omdbapi.com`); a movie and a series as `ShowDetails`; episodes and games dropped; hits deduplicated and capped at ten; the `s=`/`type`/`i=`/`plot=short` requests; empty searches; `not-found`; bad questions refused before calling OMDb; no key; every OMDb error mapped, with neither the key nor OMDb's text in the answer; a failed request; the timeout, and that it is 8 s by default.
