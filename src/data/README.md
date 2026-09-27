# data
The only way screens reach stored rows: the `Collection` and `DataStore` contract, a shared row cache, and two backends.

## Files
| File | Responsibility |
| --- | --- |
| `types.ts` | `Collection<T>`, `PhotoStore`, and `DataStore` (every collection one family owns). |
| `index.ts` | `createStore(familyId)`: a backend picked by `VITE_BACKEND`, wrapped in `withCache`. |
| `cache.ts` (+ `cache.test.ts`) | `CachedCollection`, `withCache()`, `cacheOf()`, `preloadStore()`: one shared copy per collection, writes shown at once. |
| `useCollection.ts` | `useCollectionState()` (`rows` and `loaded`) and `useCollection()` (rows only). |
| `collection.contract.ts` | `runDataStoreContract(name, make, reset?)`: the nine cases every backend must pass. |
| `local/localStore.ts` (+ `localStore.test.ts`) | localStorage backend, plus `readPreference`/`writePreference` and `readDevicePreference`/`writeDevicePreference`. |
| `local/localPhotos.ts` | Local `PhotoStore` in IndexedDB (`nestead-photos`). |
| `supabase/supabaseClient.ts` | Browser client from `VITE_SUPABASE_*`, remember-me session storage, email-link parsing. |
| `supabase/supabaseStore.ts` (+ `supabaseStore.test.ts`) | Supabase backend: snake_case mapping, realtime `subscribe`, the `recipe-photos` bucket. |
| `supabase/supabaseTestSession.ts` | `signInTester()` for the live suites, retrying transient failures. |
| `supabase/supabaseRealtime.test.ts` | A change made by a second client arrives over realtime. |
| `supabase/joinCode.test.ts` | `rotate_join_code()` against the live project. |

## How it works
- `createStore()` picks by `VITE_BACKEND` (unset means `local`, anything else throws), but only `../auth/demoSession.tsx` calls it; `../auth/supabaseSession.tsx` builds `withCache(createSupabaseStore(...))` itself (`index.ts`).
- `CachedCollection` runs at most one read at a time, queues one more for changes that arrive mid-read, applies `update` and `remove` at once and undoes them if the backend refuses (`cache.ts`).
- A collection nobody watches stays subscribed for `LINGER_MS` (30 s); `preload()` opens one before its screen mounts (`cache.ts`).
- `loaded` is false until the first read, so a screen can tell "no rows" from "not read yet" (`useCollection.ts`).
- Local rows are one JSON array per key `nestead:<familyId>:<collection>`; other tabs hear of changes through the `storage` event (`local/localStore.ts`).
- The guarantees every backend owes are listed in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#collectiont).

## Connections
- Uses: `../domain/types.ts`, `@supabase/supabase-js`.
- Used by: `../auth/` (building the store), every screen through `useCollection`, and `local/localStore.ts`'s preference helpers in `../components/theme/`, `../i18n/`, `../features/board/`, `../features/lists/`, `../features/larder/timers/`.

## Rules & gotchas
- A patch value of `undefined` clears the field in both backends and the cache (`cache.ts` `merge`, `supabaseStore.ts` `toRow`, and a contract case).
- `supabaseStore.ts` converts top-level keys only (nested jsonb keeps camelCase), reads NULL as absent, and throws on an `update` that matched no row, which PostgREST reports as success.
- `localStore.ts` calls itself the only localStorage user, but `../auth/invite.ts` and `supabase/supabaseClient.ts` use it too.
- Photo ids are `<familyId>/<uuid>` locally and `<familyId>/<uuid>.jpg` on Supabase (`local/localPhotos.ts`, `supabase/supabaseStore.ts`).
- With all six `SUPABASE_TEST_*` values in `.env.test`, `npm test` runs the live suites, which delete every row in both test families between cases (`supabase/supabaseStore.test.ts`).

## Tests
The contract runs three times: `local/localStore.test.ts`, `cache.test.ts` (cached local, plus ten cache cases), and `supabase/supabaseStore.test.ts` (live). The Supabase suites run in the `node` environment, not jsdom.
