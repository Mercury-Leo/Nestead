# Nestead
Shared family app: a kanban board, Larder, the kitchen (recipes, pantry, diet, shopping list, cook mode), and Activities (Shows: the family's movies and series). React 18, TypeScript strict, Vite 5, Vitest 2 + jsdom, react-router 6, i18next; Supabase or a localStorage demo backend.

## Commands
- `npm run dev`: Vite, plus `/api/import`, `/api/search`, `/api/shows`, `/api/places` and `/api/ai` from `server/`; `vite preview` mounts them too (`vite.config.ts`). Search needs `TAVILY_API_KEY` in `.env.local`; Shows needs `OMDB_API_KEY`; AI needs `OPENROUTER_API_KEY`, `OPENROUTER_FREE_MODELS` and `AI_KEY_SECRET` there (`.env.example`). Places needs no key.
- `npm run build`: `tsc --noEmit && vite build`. Refuses unless `VITE_BACKEND=supabase` and both `VITE_SUPABASE_*` are set (`vite.config.ts`); demo build: `npx vite build --mode demo`.
- `npm test`: every suite. With `.env.test` present it also runs live Supabase suites that delete rows in both test families.
- One file: `npx vitest run src/features/board/recurrence.test.ts`.

## Architecture
- Screens: rows only through `useSession()`, `useCollection()` and `useKitchen()`; from a backend module they import only the preference helpers.
- Backend: `SessionProvider` (`src/auth/session.tsx`) picks demo or Supabase by `VITE_BACKEND`, the only place that names one; a backend is a `DataStore` that passes `runDataStoreContract()` unchanged plus an `Account` (`src/data/types.ts`). Porting steps: `docs/ARCHITECTURE.md#swapping-the-backend`.
- Supabase: only `src/data/supabase/` imports `@supabase/supabase-js` or that folder, bar `session.tsx`; `src/data/boundary.test.ts` fails otherwise.
- Cache: `withCache()` wraps every backend, so writes show before the backend confirms (`src/data/cache.ts`). A failed read is retried and never counts as `loaded`; screens show `LoadFailed` for `failed && !loaded`, never an empty state (`src/components/LoadFailed.tsx`).
- Session: screens rely only on the `Session` type in `src/auth/session.tsx`, never on which session provides it.
- Domain: `src/domain/` is pure and imports nothing outside itself; `types.ts` mirrors `supabase/schema.sql`.
- Kitchen: screens read shared rows from `useKitchen()` and write through `src/features/larder/actions.ts`.
- Import API: one `(Request) => Response` handler in `server/import/`, run by `vite.config.ts` in dev and preview and `functions/api/import.ts` on Cloudflare.
- Search API: the same shape in `server/search/` (`functions/api/search.ts`); it returns links on recipe sites the importer reads, and the one chosen goes through `/api/import`.
- Shows API: the same shape in `server/shows/` (`functions/api/shows.ts`): search and one title's details from a `ShowsProvider`, OMDb today, chosen only in `server/shows/provider.ts`; called only to add a show or refresh one; the details are saved as a `shows` row, so the list never calls it.
- Places API: the same shape in `server/places/` (`functions/api/places.ts`): address suggestions from an `AddressProvider` chosen in `server/places/provider.ts` (Photon today); the browser calls only `/api/places`.
- AI API: the same shape in `server/ai/` (`functions/api/ai/[[path]].ts`): one model call per read, validated into `ImportedRecipe`, never acted on; Supabase is called with the member's own token; family keys are encrypted by the server (`AI_KEY_SECRET`).
- Text: UI strings come from `t()`, with keys typed from `src/i18n/locales/en.json`.

## Where things live
| Folder | What | Guide |
| --- | --- | --- |
| `src/app/` | Shell, sections (sidebar, tab bar with More, page pills), routes | [README](src/app/README.md) |
| `src/auth/` | Demo session and `AccountSession` (any backend), sign-in, invite links | [README](src/auth/README.md) |
| `src/data/` | `DataStore` and `Account` interfaces, contract, cache, local and Supabase backends | [README](src/data/README.md) |
| `src/domain/` | Types, ordering, pure kitchen logic, Shows filtering and the refresh patch | [README](src/domain/README.md) |
| `src/components/` | UI kit (`ui/`) and theme | [README](src/components/README.md) |
| `src/i18n/` | i18next, locale provider, formatting, locale files | [README](src/i18n/README.md) |
| `src/features/board/` | Kanban board, drag and drop, repeating chores | [README](src/features/board/README.md) |
| `src/features/lists/` | Shopping list and its sections | [README](src/features/lists/README.md) |
| `src/features/family/` | Family page: invites, members, the AI assistant card, theme, language; `addresses/`, the address book | [README](src/features/family/README.md) |
| `src/features/larder/` | Kitchen: a folder per screen, `recipe/` shared UI, `seed/`, `timers/` | [README](src/features/larder/README.md) |
| `src/features/activities/` | Activities: `shows/`, the family's movies and series (cards, add sheet, `/api/shows` client, writes) | [README](src/features/activities/README.md) |
| `src/ai/` | Browser client for `/api/ai` | [README](src/ai/README.md) |
| `src/hooks/`, `src/styles/` | Media query, direction, wake lock, pointer-drag helpers; `tokens.css` palette | none |
| `server/import/` | Recipe import handler | [README](server/import/README.md) |
| `server/search/` | Recipe search handler: Tavily, English and Hebrew recipe sites | [README](server/search/README.md) |
| `server/shows/` | Shows API: a provider interface, OMDb behind it (`provider.ts` is the swap point), search, one title's details, normalising | [README](server/shows/README.md) |
| `server/places/` | Address suggestions: the `AddressProvider` interface, Photon behind it | [README](server/places/README.md) |
| `server/ai/` | AI recipe reading: OpenRouter, key encryption, output validation | [README](server/ai/README.md) |
| `supabase/` | Schema, migrations, CLI config | [README](supabase/README.md) |
| `scripts/perf/` | Performance measurements: bundle, page load, interactions, database; results in `docs/PERFORMANCE.md` | [README](scripts/perf/README.md) |
| `.claude/skills/` | Claude Code skills: `preview` builds the production bundle and opens it on port 4173 for the user to test, signed in | [SKILL.md](.claude/skills/preview/SKILL.md) |

## Rules
- Before editing a folder, read its README's "Rules & gotchas"; update the README on the same branch. Merges into `main` are blocked until you do (`../.claude/hooks/docs-on-merge.mjs`; `# docs-ok` only after checking).
- Every third-party service sits behind an interface so it can be swapped: one module names the service, the rest (and all browser code) talks to the interface or the app's own `/api/*` route. A new service gets a provider interface and a swap point (`server/places/provider.ts` is the pattern).
- Backend work stays behind the interfaces: a new backend capability is a method on `DataStore` or `Account` (`src/data/types.ts`), implemented in each adapter folder (`src/data/supabase/`, `src/data/local/` where it applies) and called through the interface. No backend SDK, table name, RPC name or backend-specific behaviour outside its adapter folder; the only file that names a backend is `src/auth/session.tsx` (`src/data/boundary.test.ts`). On the server side, only `server/ai/store.ts` names RPCs (over PostgREST, with the member's own token). If a feature needs something the interfaces cannot express, extend the interface and document what the backend must enforce, rather than reaching past it.
- Schema change: a new file in `supabase/migrations/`, the same change in `supabase/schema.sql`, and `src/domain/types.ts`.
- Omitting a key in a patch leaves the field; patch it to `undefined` to clear it (`src/data/cache.ts`, `src/data/supabase/supabaseStore.ts`).
- Reorder by writing one row at `positionBetween()` of its neighbours and sort with `comparePosition()` (`src/domain/position.ts`).
- Device-only state (filters, folded sections, timers, theme, locale) uses the preference helpers in `src/data/local/localStore.ts`, never the `DataStore`.
- Stored values stay English (catalog names, sections, staples, seed text); screens translate them through `src/features/larder/labels.ts`.
- English kept in code on purpose needs an `i18n:` comment, or `src/i18n/literals.test.ts` fails.
- CSS modules everywhere except `src/styles/*.css`, `board.css` and `auth.css`, whose import order `src/main.tsx` sets.
- Theme colours are tokens in `src/styles/tokens.css`, redefined for dark mode; components never branch on the theme.
- Only the publishable key may go in a `VITE_*` variable: every `VITE_*` value ships in the bundle (`.env.example`). Server-only secrets such as `TAVILY_API_KEY` and `OMDB_API_KEY` never take the prefix.
- Model output is data: never follow a URL from it, call a tool for it, or save it without the person confirming. `AI_KEY_SECRET` and OpenRouter keys are server-only, never logged or returned.

## Gotchas
- `src/i18n/literals.test.ts` skips files by path (`domain/`, `data/`, `i18n/`, `/seed/`, …): moving a file can change what it checks.
- `src/features/larder/seed/webIndex.ts` is production code (the Search page's web recipes, and "Search online"'s fallback without a key), not demo data.
- Hebrew ingredient names live apart from the catalog, in `src/domain/kitchen/hebrewNames.ts`, keyed by catalog id: a new catalog item needs its Hebrew names there too. A recipe whose lines mostly match nothing (another language) gets no diet verdict in the import preview (`mostlyUnrecognised()`).
- Don't add `StrictMode`: `src/main.tsx` leaves it out so the demo seed does not run twice.
- `index.html` reads the theme and locale preferences before React; keep its keys in step with `src/components/theme/theme.tsx` and `src/i18n/i18n.ts`.
- Auth screens take the `Account` as a prop from `AccountSession`; never reach for a backend client in a screen.
- Local and production `AI_KEY_SECRET` differ while sharing one Supabase project: a family key saved locally answers `key-invalid` in production. The SQL tests for the AI functions run on PGlite (`tests/sql/`), never against the live project.
