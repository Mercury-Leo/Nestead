# Nestead

A shared home-organisation app for one family: a kanban board of household
tasks, and **Larder**, the family kitchen — recipes, a pantry, a diet profile, a
shopping list and a cook mode with timers. Everyone in the family sees the same
board, pantry and list.

The board is the home page; the kitchen sits beside it in the same sidebar (or
tab bar on a phone). Underneath both is the core: a family-scoped data layer,
the session, the domain types, a single backend swap point and the contract
tests that any backend has to pass.

## Getting started

```bash
npm install
npm run dev
```

You get a board with three seeded columns (To do / Doing / Done), two seeded
members, and an "I am" switcher so two tabs can be two people.

Tasks have a title, an emoji icon and an assignee. Tap a card to move it to
another column, reorder it, change its icon or assignee, or delete it. Column
headers rename in place and can be reordered or removed once empty.

No drag and drop: cards move by an explicit picker, which works on touch and
with a keyboard and costs no dependency. It can be added later without any
change to stored data.

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
| Import          | `/import`          | Read a recipe from a link, or pick one from the offline web index   |
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
| `npm test`      | Vitest: domain, seed, import and data-store suites   |

Copy `.env.example` to `.env.local` if you want to change `VITE_BACKEND`. The
default is `local`, the no-accounts demo. `npm run build` refuses to build
unless `VITE_BACKEND=supabase` and both `VITE_SUPABASE_*` values are set, so a
build without `.env.local` cannot ship demo mode by accident. For a deliberate
demo build, run `npx vite build --mode demo`.

## Stack

| Concern         | Choice                             |
| --------------- | ---------------------------------- |
| UI              | React 18 + TypeScript (strict)     |
| Build           | Vite 5                             |
| Tests           | Vitest 2 + jsdom                   |
| Data (today)    | `localStorage`, per family         |
| Data (planned)  | Supabase Postgres + RLS            |
| Auth (today)    | Fake: pick a member, per tab       |
| Auth (planned)  | Supabase Auth + family join code   |
| Hosting         | Static: Cloudflare Pages or Vercel |

Runtime dependencies: `react`, `react-dom`, `@supabase/supabase-js`,
`react-router-dom` (routes), `lucide-react` (icons) and the two self-hosted font
packages (`@fontsource-variable/newsreader`, `@fontsource/hanken-grotesk`).
Nothing else: timers, drag handles, sheets and the import parser are hand-written.

## Principles

1. **Screens never touch storage** — only `useSession()` and `useCollection()`.
2. **Every row is family-scoped** — `familyId` on every row, enforced by RLS in
   the target schema.
3. **Backends swap in one place** (`src/data/index.ts`) **and must pass the same
   contract** (`runDataStoreContract`).
4. **Domain types mirror the SQL schema** — camelCase in TS, snake_case in
   Postgres, same shapes.
5. **Features are additive** — a new screen never edits the data layer.

## Layout

```
src/
  domain/                    Entities, Base, NewRow, board ordering.
  domain/kitchen/            Pure kitchen logic: ingredient catalog and parser,
                             pantry fit, diet rules, scaling, timers in text,
                             calorie estimates, shopping list, search.
  data/                      Collection/DataStore, local and Supabase backends,
                             photo stores, the swap point, useCollection, the
                             contract.
  auth/                      SessionProvider / useSession, sign-in screens.
  features/board/            The kanban board.
  features/lists/            The shopping list: Supermarket, General, your own sections.
  features/larder/           The kitchen screens, seed data and timer engine.
  components/                Shared UI kit, page header, error boundary.
  styles/tokens.css          Design tokens: the one palette for the whole app.
  Shell.tsx  App.tsx  main.tsx  styles.css   Sidebar/tab bar and routes.
server/import.ts             Recipe import: fetch a page, read schema.org data.
functions/api/import.ts      The same, as a Cloudflare Pages Function.
supabase/schema.sql          Postgres schema; migrations/ for existing projects.
docs/ARCHITECTURE.md         The long version, including the Supabase path.
docs/LARDER.md               The kitchen: design notes, decisions, deviations.
```

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

`tasks` re-renders on every change, including changes from another tab. Nothing
in a feature knows or cares where the rows live.

## Adding Supabase later

Summarised: apply `supabase/schema.sql` → write `createSupabaseStore()` → make
it pass `runDataStoreContract()` **unchanged** → add one case to
`src/data/index.ts` → replace the internals of `SessionProvider` with Supabase
Auth, one account per person joining a family by **code** (never a shared family
password). The full step-by-step is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Only the Supabase **anon** key may go in a `VITE_*` variable — every `VITE_*`
value is inlined into the public bundle. A service-role key must never appear
in this repo.

## Known limits

- **Auth is fake.** No access control at all: anyone who opens the app is in the
  demo family and can be anyone in it.
- **~5 MB of storage.** `localStorage` is capped around 5 MB per origin. Plenty
  for text, but it is a ceiling, not a horizon.
- **Last write wins.** No merge, no conflict detection.
- **Same-browser sync only.** The `storage` event reaches other tabs, not other
  devices.
- **No prices.** Shopping lists have quantities, not costs.
- **Offline web search only.** "Search online" looks through a bundled index
  of recipes. A real search provider needs an API key and is not wired up.
