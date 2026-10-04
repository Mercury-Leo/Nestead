# activities
Things the family does together outside the kitchen. One page so far: Shows (`/shows`), the family's list of movies and series, added from OMDb.

## Files
| File | Responsibility |
| --- | --- |
| `shows/Shows.tsx` (+ `Shows.module.css`) | The page: name search, status filter with counts, movies or series, sort, the cards; the empty state; opens `AddShow`. |
| `shows/ShowCard.tsx` (+ `ShowCard.module.css`) | One show: poster, title linking to IMDb, the facts line (`Facts`), the status button, and behind the toggle the plot, when OMDb was read, Refresh and Delete with confirmation. |
| `shows/AddShow.tsx` (+ `AddShow.module.css`) | The add sheet: search, results, preview, save. |
| `shows/Poster.tsx` (+ `Poster.module.css`) | OMDb's poster link as an `<img>`, or a tile with the kind's icon when there is none or it fails. |
| `shows/actions.ts` (+ `actions.test.ts`) | The writes: `addShow()`, `cycleStatus()`, `refreshShow()`, `removeShow()`. |
| `shows/omdb.ts` (+ `omdb.test.ts`) | Browser client for `/api/shows`: `searchShows()`, `lookupShow()`; types only from `../../../server/shows`. |
| `shows/labels.ts` | Words for statuses and kinds; `imdbUrl()`. |

## How it works
- OMDb's details are saved as a row when a show is added; the page reads rows through `useCollectionState(store.shows)`. Filters, sort and the name search run on those rows (`../../domain/shows.ts`), so opening the page or a card never calls OMDb.
- OMDb is called in three places only: Search in the add sheet (when the form is sent, never per keystroke), choosing a result (its details, short plot), and Refresh from OMDb on one card (`AddShow.tsx`, `actions.ts`). There is no refresh of the whole list, and nothing in the background.
- A result already on the list is marked "In your list"; choosing it, or saving one another device added a moment ago, opens the existing card instead of adding a second (`addShow()`; Supabase's unique constraint turns the second insert away). Opening a card clears filters that hide it, scrolls it into view, opens it, focuses its title and flashes it once (`reveal()` in `Shows.tsx`, `revealed` in `ShowCard.tsx`).
- The status button cycles To watch, Watching, Watched; Watched stamps `watchedAt` and leaving it clears it (`statusPatch()`).
- Refresh writes `refreshPatch()`: OMDb's fields and `fetchedAt`, never `status`, `watchedAt` or who added it. A field OMDb no longer has is cleared. If OMDb fails, the card says so quietly and nothing is written.
- Posters are OMDb's `posterUrl` (Amazon's image servers), loaded and cached by the browser with no referrer. Nothing downloads, uploads or stores an image.
- The status and kind filters and the sort are a per-family device preference, `showsView` (`readPreference`/`writePreference`); the name search is not kept.
- The Shows collection is not read at sign-in (`preloadStore()` leaves it out); the page shows Loading until its first read.

## Connections
- Uses: `../../auth/session.tsx`, `../../data/useCollection.ts`, `../../data/local/localStore.ts` (preference helpers), `../../domain/shows.ts`, `../../components/` (PageHeader, ui), `../../hooks/useMediaQuery.ts`, `../../i18n/`, and types from `../../../server/shows/`.
- Used by: `../../app/AppRoutes.tsx`.

## Rules & gotchas
- Never call OMDb to show the list or a card, and never refresh more than the one show someone asked for: the free key allows 1,000 requests a day for the whole app (`../../../server/shows/README.md`).
- Save only `posterUrl`, never the image, and never an `img.omdbapi.com` link (it needs the key). `Poster.tsx` also refuses anything but https.
- OMDb text is data. Titles and plots render as React text; in a `<Trans>` string a title goes in a named slot (`<item/>` with `<bdi>`), never as a value (`shows.card.deleteQuestion`).
- Writes go through `shows/actions.ts`, and which fields a refresh may write is decided in `../../domain/shows.ts` (`REFRESHED_FIELDS`), not in a screen.
- Stored statuses are kebab-case (`to-watch`); translation keys are camelCase (`shows.status.toWatch`), mapped by `STATUS_KEY` in `labels.ts`.
- Shows UI stays in this folder; it imports nothing from `../larder/`.

## Tests
`shows/omdb.test.ts`: the request for a search and a title, the endpoint missing or unconfigured, the limit told from other failures, an answer about another title refused. `shows/actions.test.ts` (local store): adding To watch, the same title opened rather than added twice, the status cycle and `watchedAt`, a refresh that keeps the status, and nothing written when OMDb fails. Filtering, sorting and the refresh patch: `../../domain/shows.test.ts`. The handler: `../../../server/shows/shows.test.ts`.
