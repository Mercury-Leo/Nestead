# server/shows
Movies and series for the Shows page: search by name, and one title's details. One dependency-free `(Request) => Promise<Response>` handler, with the service behind it a `ShowsProvider`. OMDb answers today.

## Files
| File | Responsibility |
| --- | --- |
| `index.ts` | The public surface: re-exports the handler, the provider choice, the OMDb provider and parsers, and the types. |
| `types.ts` | `ShowKind`, `ShowHit`, `ShowDetails`, `ShowsError`, `ShowsOptions`; the `ShowsProvider` interface (`search()`, `details()`), `ShowsSearch`, `ShowsProviderError`; `IMDB_ID`, the app's key for a title. |
| `provider.ts` | `defaultShowsProvider(env)`: **the swap point**, the one place that names the service. `ShowsEnv` lists the settings it reads (`OMDB_API_KEY`). |
| `handler.ts` | `createShowsHandler({ provider, timeoutMs })`: GET `?q=&type=` or `?id=`, JSON out. Checks the question, times the provider out, caps a search at ten, refuses an answer about another id, maps failures to statuses. Names no service. |
| `omdb.ts` | `omdbProvider({ apiKey, fetch })`: OMDb's `s=` and `i=…&plot=short`, its error text read into `ShowsProviderError` codes, and its rows normalised: `toHits()`, `toDetails()` and the field parsers (`present()`, `parseRuntime()`, `parseReleased()`, `parseYear()`, `parseRating()`, `parseKind()`, `parsePoster()`). |
| `shows.test.ts` | The handler with a fake provider: what it is asked, the cap of ten, `not-found`, bad questions never reaching it, each failure's status with nothing else passed on, the 8 s timeout; and that the default is OMDb with `OMDB_API_KEY`. |
| `omdb.test.ts` | The parsers on real OMDb rows; OMDb behind the handler: the requests sent, empty searches, `not-found`, no key, each OMDb error, the key never in a response, a failed request, the signal reaching `fetch`. |

## How it works
- Production: `../../functions/api/shows.ts` is the Cloudflare Pages Function at `/api/shows`; it passes the Pages environment (the secret `OMDB_API_KEY`) to `defaultShowsProvider()`.
- Development and `vite preview`: `../../vite.config.ts` mounts the same handler at `/api/shows`, with `.env.local` as the environment.
- `?q=` (1 to 200 characters) and an optional `type=movie|series` make one search; the answer is `{ results: ShowHit[] }`, at most ten. A search that finds nothing, or too much to list, is an empty list.
- `?id=tt…` reads one title with a short plot; the answer is `{ show: ShowDetails }`. No such movie or series (the provider answers `undefined`), or an answer about another id, is `not-found` (404).
- Error codes map to statuses: `invalid-query` 400 (no or bad `q`, `type` or `id`, or both `q` and `id`), `not-found` 404, `limit` 429, `failed` 502 (a `ShowsProviderError('failed')`, or anything else thrown), `not-configured` 503, `timeout` 504 (8 s); other methods get 405.
- An answer may be cached by the browser for 10 minutes (`private, max-age=600`), so searching the same title again or reopening a result costs nothing; errors are `no-store`. The app's Refresh skips that copy (`cache: 'no-store'` in `../../src/features/activities/shows/client.ts`).
- OMDb: the free key allows 1,000 requests a day. "Movie not found!", "Too many results." and "Incorrect IMDb ID." are no answer. It answers 401 both for a bad key and for the day's limit, so its `Error` text decides between them (`omdbError()`); that text is read, never passed on. Its "N/A" and blanks are absent; `Runtime` "148 min" is 148; `Released` "16 Jul 2010" is `2010-07-16`, or 1 January of `Year` when it has no date; `Year` "2008–2013" is 2008; `imdbRating` is a number from 0 to 10; `Type` is `movie` or `series`; `totalSeasons` is kept for series only. Titles stop at 300 characters and plots at 1,000. Posters are https links on Amazon's image servers; `img.omdbapi.com` is refused (`parsePoster()`), since it only answers with the key in the URL.

## Swapping the service
1. Add `<service>.ts` beside `omdb.ts`, exporting a function that returns a `ShowsProvider`. Give it the obligations in the interface's comment (`types.ts`): movies and series with an IMDb id (`IMDB_ID`) and a title, each once; absent fields left out; titles under 300 characters and plots under 1,000; posters https and free of any key; failures as `ShowsProviderError`.
2. Add its secret to `ShowsEnv` and change the one line in `defaultShowsProvider()`.
3. Add the secret to `.env.example`, `.env.local` and the Pages project; drop `OMDB_API_KEY`.
4. Check `../../src/features/activities/shows/Poster.tsx`: it resizes Amazon poster links and leaves any other link alone, so other hosts load at their own size.

The browser, the saved rows and the routes stay as they are: rows are keyed by IMDb id, and the browser only calls `/api/shows`.

## Connections
- Uses: web standards only (`fetch`, `URL`, `Response`); OMDb's API at `https://www.omdbapi.com/` (only `omdb.ts`).
- Used by: `../../functions/api/shows.ts` and `../../vite.config.ts` (`createShowsHandler`, `defaultShowsProvider`), and, for types only, `../../src/features/activities/shows/client.ts`.

## Rules & gotchas
- Only `provider.ts` names the service; `functions/api/shows.ts` and `vite.config.ts` take it from there, never from `omdb.ts`.
- The key is server-only: `OMDB_API_KEY`. A `VITE_*` name would inline it into the public bundle. OMDb takes it in the query string, so the URL sent to OMDb is never logged or returned.
- Browser code imports only types from here (`import type`), as with `../search/`.
- The app calls this only to search when adding a show, to read the chosen result, and when someone refreshes one show; the list reads saved rows (`../../src/features/activities/README.md`). The endpoint is public, so anyone who finds it can spend the day's requests; that stops adding shows until the service's reset, and bills nothing.
- Answers never include a key or the service's own text: the handler sends only what a provider returns, and only the code of a `ShowsProviderError`.
- Service text is data: the app renders titles and plots as React text, never as HTML.

## Tests
`shows.test.ts`: the handler with a fake provider: the trimmed name and kind asked, ten hits at most, details, `not-found` for no title or another id, bad questions refused before asking, each failure's status with nothing else passed on, the timeout and its 8 s default; the default provider is OMDb with `OMDB_API_KEY`, and without it asks nothing. `omdb.test.ts`: "N/A", runtimes, years, release dates with the year fallback, ratings, posters (https only, never `img.omdbapi.com`); a movie and a series as `ShowDetails`; episodes and games dropped; hits deduplicated; through the handler: the `s=`/`type`/`i=`/`plot=short` requests, empty searches, `not-found`, no key, every OMDb error mapped with neither the key nor OMDb's text in the answer, a failed request, the timeout reaching `fetch`.
