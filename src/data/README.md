# data
The only way screens reach stored rows: the `Collection` and `DataStore` contract, the `Account` interface for sign-in and families, a shared row cache, and two backends.

## Files
| File | Responsibility |
| --- | --- |
| `types.ts` | `Collection<T>`, `PhotoStore`, `DataStore` (every collection one family owns, `addresses` included), and `Account` and `Family` (sign-in, families, AI settings, `openStore()`). |
| `boundary.test.ts` | Fails if anything outside `supabase/` imports the Supabase SDK or that folder, bar `../auth/session.tsx`. |
| `cache.ts` (+ `cache.test.ts`) | `CachedCollection`, `withCache()`, `cacheOf()`, `preloadStore()`: one shared copy per collection, writes shown at once. |
| `useCollection.ts` | `useCollectionState()` (`rows` and `loaded`), `useCollection()` (rows only), and `preloadCollection()`, which starts a collection's read ahead of its screen (`../app/warm.ts`). |
| `collection.contract.ts` | `runDataStoreContract(name, make, reset?)`: the eleven cases every backend must pass, among them show rows and address rows (Hebrew, optional fields cleared). |
| `local/localStore.ts` (+ `localStore.test.ts`) | localStorage backend, plus `readPreference`/`writePreference` and `readDevicePreference`/`writeDevicePreference`. |
| `local/localPhotos.ts` | Local `PhotoStore` in IndexedDB (`nestead-photos`). |
| `supabase/supabaseClient.ts` | Browser client from `VITE_SUPABASE_*`, remember-me session storage, email-link parsing. |
| `supabase/supabaseStore.ts` (+ `supabaseStore.test.ts`) | Supabase backend: snake_case mapping, realtime `subscribe`, the `recipe-photos` bucket. |
| `supabase/supabaseAccount.ts` (+ `supabaseAccount.test.ts`) | Supabase `Account`: Supabase Auth, membership in one request, the `create_family`, `join_family`, `rotate_join_code`, `invite_family_name` RPCs, and the AI settings: `accessToken()` from the auth session and the `family_ai_status`, `clear_family_ai_key`, `set_family_ai_model` RPCs. `supabaseAccount()` is the browser's shared one. |
| `supabase/aiStatus.ts` (+ `aiStatus.test.ts`) | `toAiStatus()`: `family_ai_status()`'s jsonb as an `AiStatus`, taking only the fields it names. |
| `supabase/supabaseTestSession.ts` | `signInTester()` for the live suites, retrying transient failures. |
| `supabase/supabaseRealtime.test.ts` | A change made by a second client arrives over realtime. |
| `supabase/joinCode.test.ts` | `Account.rotateJoinCode()` against the live project. |
| `supabase/familyAi.test.ts` | The AI settings functions against the live project; skips until the family AI migration is applied. |

## How it works
- A backend is a `DataStore` plus, for real sign-in, an `Account` whose `openStore()` builds it. `../auth/session.tsx` is the only place that picks one; the demo session builds `withCache(createLocalStore(...))`, and `../auth/openFamily.ts` builds `withCache(account.openStore(...))`.
- `supabase/` is the whole Supabase adapter. Swapping backends means a new folder beside it with the same two interfaces; the steps are in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#swapping-the-backend).
- `CachedCollection` runs at most one read at a time, queues one more for changes that arrive mid-read, applies `update` and `remove` at once and undoes them if the backend refuses (`cache.ts`).
- A collection nobody watches stays subscribed for `LINGER_MS` (30 s); `preload()` opens one before its screen mounts (`cache.ts`).
- On Supabase, `photos.url()` calls made in the same task are signed in one `createSignedUrls` request once its microtasks have run, and each URL is kept for 55 minutes. A screen of recipe cards costs one request, not one per card (`supabaseStore.ts`).
- Realtime echoes every insert and update back to the client that made it. `supabaseStore.ts` remembers the version each of its own writes returned and drops an echo carrying exactly that version, since `create()` and `update()` have already notified. A writer re-reads the table once per write, not twice.
- `loaded` is false until the first read, so a screen can tell "no rows" from "not read yet" (`useCollection.ts`).
- `preloadStore()` reads the board's and the kitchen's collections at sign-in, not `shows`: the Shows page reads it when someone heads for its link (`preloadCollection()` from `../app/warm.ts`) or when first opened, and it lingers like any other (`cache.ts`).
- Local rows are one JSON array per key `nestead:<familyId>:<collection>`; other tabs hear of changes through the `storage` event (`local/localStore.ts`).
- The guarantees every backend owes are listed in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#collectiont).

## Connections
- Uses: `../domain/types.ts`; `@supabase/supabase-js` in `supabase/` only.
- Used by: `../auth/` (the `Account`, building the store), every screen through `useCollection`, and `local/localStore.ts`'s preference helpers in `../components/theme/`, `../i18n/`, `../features/board/`, `../features/lists/`, `../features/larder/timers/`, `../features/activities/shows/` (filters and sort), `../app/` (nav pins).

## Rules & gotchas
- New backend work goes through the interfaces: add a method to `DataStore` or `Account` in `types.ts`, implement it in the adapter folder, and call it through the interface. Screens, `../auth/` and `../features/` never import an adapter, a backend SDK, or name a table or RPC. A rule the backend must enforce goes in the interface's doc comment.
- The `Account` doc comment in `types.ts` lists what a backend must enforce itself (member id is user id, one family per person, family-only visibility, one diet profile per family). The client relies on all four.
- The AI methods (`accessToken`, `aiStatus`, `clearAiKey`, `setAiModel`) come with their own list in `types.ts`, a `//` section comment above them (a second doc comment there would bind to nothing): only a family's members read or change its AI settings; no call returns the plaintext OpenRouter key, and the encrypted one comes only through the server's claim, for the caller's own family; free reads are counted atomically per user per UTC day and for the whole app; the plaintext key is never stored. `Account` has no method to store a key: the server encrypts it and stores it (`../../server/ai/`).
- `fail()` in `supabase/supabaseAccount.ts` throws `error.message` only, never PostgREST's `details`: a check-constraint error's detail carries the whole row, ciphertext included. Keep it that way for every RPC. (`set_family_ai_model` also checks the model itself and raises a bare `Invalid model`, since a caller outside the app sees PostgREST's details; `../../supabase/README.md`.)
- `supabase/familyAi.test.ts` runs against the project in `.env.test`, which is production. It stores a fake ciphertext before anything claims and removes it in `finally`, and never calls `claim_ai_request` without a key in place, since that spends one of the app's real free reads. It skips only when `family_ai_status` is missing (the migration is not applied yet; `migrationMissing()` decides, and has unit tests that run without `.env.test`); any other error fails it. Its test has a 30 s timeout so `finally` can remove the fake key.
- A patch value of `undefined` clears the field in both backends and the cache (`cache.ts` `merge`, `supabaseStore.ts` `toRow`, and a contract case).
- `supabaseStore.ts` converts top-level keys only (nested jsonb keeps camelCase), reads NULL as absent, and throws on an `update` that matched no row, which PostgREST reports as success.
- `supabaseStore.ts` re-serialises every timestamptz column through `Date` (`TIMESTAMP_KEYS`: `createdAt`, `updatedAt`, and the shows' `fetchedAt` and `watchedAt`), so it reads back as the ISO string the app wrote rather than Postgres's `+00:00` form. A new timestamptz column joins that set; a `date` column (`released`, `dueDate`) is already `YYYY-MM-DD`.
- `shows` holds one row per `imdbId` per family. Supabase enforces it with a unique constraint; the local store does not, and relies on `addShow()` checking first (`types.ts`, `../features/activities/shows/actions.ts`).
- A show's `favorite` is absent on a new local row and `false` on a Supabase one (the column defaults to false and is not null), so read it as `favorite === true`. Unstar by writing `false`: patching it to `undefined` writes NULL there, which the column refuses.
- Another client's delete never arrives over realtime. The channel filters on `family_id`, and a DELETE event carries only the primary key, so the filter never matches. The deleting client still notifies its own listeners (`supabaseStore.ts`; measured in `../../docs/PERFORMANCE.md`).
- `localStore.ts` calls itself the only localStorage user, but `../auth/invite.ts` and `supabase/supabaseClient.ts` use it too.
- Photo ids are `<familyId>/<uuid>` locally and `<familyId>/<uuid>.jpg` on Supabase (`local/localPhotos.ts`, `supabase/supabaseStore.ts`).
- With all six `SUPABASE_TEST_*` values in `.env.test`, `npm test` runs the live suites, which delete every row in both test families between cases (`supabase/supabaseStore.test.ts`). They clear and test `shows` and `addresses` too, so they fail until `../../supabase/migrations/20261004120000_shows.sql`, `20261004200000_addresses.sql`, `20261005120000_shows_favorite.sql` and `20261005130000_shows_genres.sql` are applied to that project.

## Tests
The contract runs three times: `local/localStore.test.ts`, `cache.test.ts` (cached local, plus ten cache cases), and `supabase/supabaseStore.test.ts` (live). Its shows case round-trips a release date, `fetchedAt`, a decimal rating, sets then clears `watchedAt`, moves to `dropped`, then stars and unstars the show; a second shows case keeps genres as a list, an empty list apart from none, and replaces it whole. On Supabase they need `../../supabase/migrations/20261004150000_shows_dropped.sql`, `20261005120000_shows_favorite.sql` and `20261005130000_shows_genres.sql` applied. The Supabase suites run in the `node` environment, not jsdom. `boundary.test.ts` reads source files only. `supabase/aiStatus.test.ts` maps `family_ai_status()` rows (with a key, free only, a setter who left, and a field it must not carry).
