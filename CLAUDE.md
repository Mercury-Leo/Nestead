# Nestead
Shared family app: a kanban board plus Larder, the kitchen (recipes, pantry, diet, shopping list, cook mode). React 18, TypeScript strict, Vite 5, Vitest 2 + jsdom, react-router 6, i18next; Supabase or a localStorage demo backend.

## Commands
- `npm run dev`: Vite, plus `/api/import` from `server/import/`. `vite preview` has no `/api/import` (`vite.config.ts`).
- `npm run build`: `tsc --noEmit && vite build`. Refuses unless `VITE_BACKEND=supabase` and both `VITE_SUPABASE_*` are set (`vite.config.ts`); demo build: `npx vite build --mode demo`.
- `npm test`: every suite. With `.env.test` present it also runs live Supabase suites that delete rows in both test families.
- One file: `npx vitest run src/features/board/recurrence.test.ts`.

## Architecture
- Screens: rows only through `useSession()`, `useCollection()` and `useKitchen()`; from a backend module they import only the preference helpers.
- Backend: `SessionProvider` (`src/auth/session.tsx`) picks demo or Supabase by `VITE_BACKEND`; a backend counts once it passes `runDataStoreContract()` unchanged.
- Cache: `withCache()` wraps every backend, so writes show before the backend confirms (`src/data/cache.ts`).
- Session: screens rely only on the `Session` type in `src/auth/session.tsx`, never on which session provides it.
- Domain: `src/domain/` is pure and imports nothing outside itself; `types.ts` mirrors `supabase/schema.sql`.
- Kitchen: screens read shared rows from `useKitchen()` and write through `src/features/larder/actions.ts`.
- Import API: one `(Request) => Response` handler in `server/import/`, run by `vite.config.ts` in dev and `functions/api/import.ts` on Cloudflare.
- Text: UI strings come from `t()`, with keys typed from `src/i18n/locales/en.json`.

## Where things live
| Folder | What | Guide |
| --- | --- | --- |
| `src/app/` | Shell, sidebar and tab bar, routes | [README](src/app/README.md) |
| `src/auth/` | Demo and Supabase sessions, sign-in, invite links | [README](src/auth/README.md) |
| `src/data/` | Contract, cache, local and Supabase backends | [README](src/data/README.md) |
| `src/domain/` | Types, ordering, pure kitchen logic | [README](src/domain/README.md) |
| `src/components/` | UI kit (`ui/`) and theme | [README](src/components/README.md) |
| `src/i18n/` | i18next, locale provider, formatting, locale files | [README](src/i18n/README.md) |
| `src/features/board/` | Kanban board, drag and drop, repeating chores | [README](src/features/board/README.md) |
| `src/features/lists/` | Shopping list and its sections | [README](src/features/lists/README.md) |
| `src/features/family/` | Family page: invites, members, theme, language | [README](src/features/family/README.md) |
| `src/features/larder/` | Kitchen: a folder per screen, `recipe/` shared UI, `seed/`, `timers/` | [README](src/features/larder/README.md) |
| `src/hooks/`, `src/styles/` | Media query, direction, wake lock, pointer-drag helpers; `tokens.css` palette | none |
| `server/import/` | Recipe import handler | [README](server/import/README.md) |
| `supabase/` | Schema, migrations, CLI config | [README](supabase/README.md) |
| `scripts/perf/` | Performance measurements: bundle, page load, interactions, database; results in `docs/PERFORMANCE.md` | [README](scripts/perf/README.md) |
| `.claude/skills/` | Claude Code skills: `preview` builds the production bundle and opens it on port 4173 for the user to test, signed in | [SKILL.md](.claude/skills/preview/SKILL.md) |

## Rules
- Before editing a folder, read its README's "Rules & gotchas"; update the README on the same branch. Merges into `main` are blocked until you do (`../.claude/hooks/docs-on-merge.mjs`; `# docs-ok` only after checking).
- Schema change: a new file in `supabase/migrations/`, the same change in `supabase/schema.sql`, and `src/domain/types.ts`.
- Omitting a key in a patch leaves the field; patch it to `undefined` to clear it (`src/data/cache.ts`, `src/data/supabase/supabaseStore.ts`).
- Reorder by writing one row at `positionBetween()` of its neighbours and sort with `comparePosition()` (`src/domain/position.ts`).
- Device-only state (filters, folded sections, timers, theme, locale) uses the preference helpers in `src/data/local/localStore.ts`, never the `DataStore`.
- Stored values stay English (catalog names, sections, staples, seed text); screens translate them through `src/features/larder/labels.ts`.
- English kept in code on purpose needs an `i18n:` comment, or `src/i18n/literals.test.ts` fails.
- CSS modules everywhere except `src/styles/*.css`, `board.css` and `auth.css`, whose import order `src/main.tsx` sets.
- Theme colours are tokens in `src/styles/tokens.css`, redefined for dark mode; components never branch on the theme.
- Only the publishable key may go in a `VITE_*` variable: every `VITE_*` value ships in the bundle (`.env.example`).

## Gotchas
- `src/i18n/literals.test.ts` skips files by path (`domain/`, `data/`, `i18n/`, `/seed/`, …): moving a file can change what it checks.
- `src/features/larder/seed/webIndex.ts` is production code (the offline search index), not demo data.
- Don't add `StrictMode`: `src/main.tsx` leaves it out so the demo seed does not run twice.
- `index.html` reads the theme and locale preferences before React; keep its keys in step with `src/components/theme/theme.tsx` and `src/i18n/i18n.ts`.
- Only `DemoSession` calls `createStore()` (`src/data/index.ts`); `SupabaseSession` builds its store itself, so production never runs `createStore()`'s Supabase branch.
