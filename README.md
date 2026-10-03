# Nestead

A shared home-organisation app for one family: a kanban board of household
tasks, and **Larder**, the family kitchen — recipes, a pantry, a diet profile, a
shopping list and a cook mode with timers. Everyone in the family sees the same
board, pantry and list.

The board is the home page; the kitchen and the other sections sit beside it in the same sidebar (or
tab bar on a phone). Underneath both is the core: a family-scoped data layer,
the session, the domain types, one place that picks the backend, and the
contract tests that any backend has to pass.

## Getting started

```bash
npm install
npm run dev
```

With the default local backend you get a board with three seeded columns
(To do / Doing / Done), two seeded members, and an "I am" switcher so two tabs
can be two people.

Tasks have a title, an emoji icon and an assignee, and optionally a
description, a due date and a repeat (daily to every three months). Drag a card
to move it within its column or to another; tap it to edit the rest or delete
it. A search box and an assignee filter narrow the board. Column headers rename
in place and can be reordered or removed once empty.

Dragging uses pointer events, so it works with a finger as well as a mouse: a
finger rests on a card for a moment to lift it. A repeating chore is one card
that comes back round: done, it returns on its next date.

On a phone the columns stack into collapsible sections, Done folded by default,
so every column and its count stays on screen instead of hiding behind a
horizontal swipe. Desktop keeps the side-by-side board.

### The kitchen (Larder)

| Screen          | Route              | What it does                                                        |
| --------------- | ------------------ | ------------------------------------------------------------------- |
| Library         | `/library`         | The family's recipes, with how much of each you already have        |
| Search          | `/search`          | By ingredients or name, ranked by pantry fit, filtered by diet      |
| Recipe          | `/recipe/:id`      | Scaled ingredients, have/staple/to-buy, steps with timers           |
| Cook mode       | `/recipe/:id/cook` | Full screen, one step at a time, tap-to-start timers                |
| Add / edit      | `/add`             | Write a recipe; `?edit=:id` edits one                               |
| Import          | `/import`          | Read a recipe from a link, or search recipe sites in English and Hebrew |
| Pantry          | `/pantry`          | What you have now, and the staples assumed always present           |
| Shopping list   | `/lists`           | Everything to buy, by shop: recipes' missing groceries by aisle, General, your own sections |
| Diet profile    | `/profile`         | Rules every search and import is checked against                    |

The local (demo) backend seeds a full kitchen: 9 recipes, 34 pantry items, 8
staples, a diet profile and a shopping list. Open the app with `?reset-kitchen`
to put it back. A real family starts with the 8 staples and nothing else.

Cook-mode timers belong to the device, not the family: they survive reloads and
leaving cook mode, and alert (sound, vibration, notification) on any screen.

| Command         | What it does                                        |
| --------------- | --------------------------------------------------- |
| `npm run dev`   | Vite dev server                                      |
| `npm run build` | `tsc --noEmit` then `vite build`                     |
| `npm test`      | Vitest; with `.env.test`, also the live Supabase suites |

Copy `.env.example` to `.env.local` if you want to change `VITE_BACKEND`. The
default is `local`, the no-accounts demo. `npm run build` refuses to build
unless `VITE_BACKEND=supabase` and both `VITE_SUPABASE_*` values are set, so a
build without `.env.local` cannot ship demo mode by accident. For a deliberate
demo build, run `npx vite build --mode demo`.

"Search online" on the import screen needs a free [Tavily](https://tavily.com)
key (1,000 searches a month, no card): `TAVILY_API_KEY` in `.env.local` for
`npm run dev` and `vite preview`. It is server-only, so never give it a `VITE_`
prefix. Without it, search falls back to the recipes that ship with the app.

## Stack

| Concern         | Choice                             |
| --------------- | ---------------------------------- |
| UI              | React 18 + TypeScript (strict)     |
| Build           | Vite 5                             |
| Tests           | Vitest 2 + jsdom                   |
| Data            | Supabase Postgres + RLS            |
| Data (demo)     | `localStorage`, per family         |
| Auth            | Supabase Auth, one account per person, family join code |
| Auth (demo)     | None: pick a member, per tab       |
| Text            | i18next: English, Hebrew           |
| Hosting         | Cloudflare Pages, plus Pages Functions for `/api/import` and `/api/search` |

Runtime dependencies: `react`, `react-dom`, `@supabase/supabase-js`,
`react-router-dom` (routes), `i18next` and `react-i18next` (translations),
`lucide-react` (icons) and six self-hosted font packages: Newsreader and Hanken
Grotesk, plus Noto Arabic and Hebrew faces for text in those scripts. Nothing
else: timers, drag and drop, sheets and the import parser are hand-written.

## Principles

1. **Screens never touch storage** — rows only through `useSession()` and
   `useCollection()`; device preferences through the helpers in
   `src/data/local/localStore.ts`.
2. **Every row is family-scoped** — `familyId` on every row, enforced by RLS in
   `supabase/schema.sql`.
3. **The backend is chosen in one place** (`SessionProvider`, `src/auth/session.tsx`)
   **and must pass the same contract** (`runDataStoreContract`).
4. **Domain types mirror the SQL schema** — camelCase in TS, snake_case in
   Postgres, same shapes.
5. **Features are additive** — a new screen never edits the data layer.

## Layout

```
src/
  app/                       Shell, sections and navigation (sidebar, tab bar, More), routes.
  auth/                      SessionProvider / useSession, demo and Supabase
                             sessions, invite links; screens/ for sign-in.
  data/                      Collection/DataStore/Account, the row cache,
                             useCollection, the contract; local/ and supabase/ backends.
  domain/                    Entities, Base, NewRow, ordering for board rows and list sections.
  domain/kitchen/            Pure kitchen logic: ingredient catalog and parser,
                             pantry fit, diet rules, scaling, timers in text,
                             calorie estimates, shopping list, search.
  components/ui/             The generic UI kit, one file per component family.
  components/theme/          Light/dark theme provider and toggle.
  hooks/                     useMediaQuery, useIsNarrow, useDirection, useWakeLock, pointerDrag.
  i18n/                      i18next, the locale provider (lang and dir), formatting; locales/.
  features/board/            The kanban board: drag and drop, filter, repeating chores.
  features/family/           The Family page: invite link, join code, members, theme, language.
  features/lists/            The shopping list: Supermarket, General, your own sections.
  features/larder/           The kitchen: a folder per screen, recipe/ for what
                             they share, timers/, and seed/ (the demo kitchen,
                             plus the offline web index every build uses).
  styles/                    tokens.css (the one palette), global.css, fonts.css.
  main.tsx                   Entry point.
server/import/               Recipe import: fetch a page, read schema.org data.
functions/api/import.ts      The same, as a Cloudflare Pages Function.
server/search/               Recipe search: find recipe pages the importer can read.
functions/api/search.ts      The same, as a Cloudflare Pages Function.
supabase/schema.sql          Postgres schema; migrations/ for existing projects.
docs/ARCHITECTURE.md         The long version, including the Supabase backend.
docs/LARDER.md               The kitchen: design notes, decisions, deviations.
CLAUDE.md                    The short guide for working in this repo.
```

Each folder under `src/` (except `hooks/` and `styles/`), plus `server/import/`,
`server/search/` and `supabase/`, has a `README.md` with its files, how it works and its rules;
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) links them all.

## Writing a feature

```tsx
import { useSession } from '../auth/session';
import { useCollection } from '../data/useCollection';

export function MyTasks() {
  const { store, me } = useSession();
  const tasks = useCollection(store.tasks);
  const mine = tasks.filter((task) => task.assigneeId === me.id);

  const rename = (id: string, title: string) => store.tasks.update(id, { title });
  // ...
}
```

`tasks` re-renders on every change, including changes from another tab. Every
screen watching a collection shares one copy of its rows, and `update` and
`remove` show on screen before the backend confirms them (see `src/data/cache.ts`). Nothing
in a feature knows or cares where the rows live.

## Supabase

Production runs on Supabase: `VITE_BACKEND=supabase` in `.env.local`, or set by
the deploy workflow. A new project applies `supabase/schema.sql` in one run; an
existing one applies the files in `supabase/migrations/`. Everyone signs in with
their own email and password (never a shared family password) and joins a family
by **code** or an invite link that carries it. Setup, the contract tests against
a test project, and the reasons are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-supabase-backend).

Only the Supabase **publishable (anon)** key may go in a `VITE_*` variable —
every `VITE_*` value is inlined into the public bundle. A secret (service-role)
key must never appear in this repo.

In production, online recipe search reads `TAVILY_API_KEY` as a secret on the
Cloudflare Pages project (Settings → Variables and Secrets, or
`npx wrangler pages secret put TAVILY_API_KEY --project-name nestead`), not
from the build.

## Known limits

- **The demo has no auth.** With the local backend, anyone who opens the app is
  in the demo family and can be anyone in it. `npm run build` will not ship it.
- **~5 MB of demo storage.** `localStorage` is capped around 5 MB per origin.
  Plenty for text, but it is a ceiling, not a horizon.
- **Last write wins.** No merge, no conflict detection.
- **The demo syncs within one browser.** The `storage` event reaches other tabs,
  not other devices; with Supabase, changes reach every member live.
- **No offline use.** The app installs to a phone's home screen but has no
  service worker.
- **No prices.** Shopping lists have quantities, not costs.
- **Two languages of ingredients.** The catalog matches English and Hebrew
  names (`src/domain/kitchen/hebrewNames.ts`); a recipe in any other language
  imports as written but gets no pantry match, diet check or calorie estimate,
  and the import preview says it was not checked rather than that it fits.
  Hebrew products the catalog has no item for (silan, baharat, pearl barley)
  stay unmatched too, and catalog names still show in English.
