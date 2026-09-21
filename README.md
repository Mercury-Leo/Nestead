# Nestead

A shared home-organisation app for one family — recipes, shopping lists, tasks
and photos, all visible to everyone in the family.

The main page is a kanban board. Underneath it sits the core: a family-scoped
data layer, a fake session, the domain types, a single backend swap point and
the contract tests that any backend has to pass.

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

| Command         | What it does                                        |
| --------------- | --------------------------------------------------- |
| `npm run dev`   | Vite dev server                                      |
| `npm run build` | `tsc --noEmit` then `vite build`                     |
| `npm test`      | Vitest: the data-store contract against `localStore` |

Copy `.env.example` to `.env.local` if you want to change `VITE_BACKEND`. The
default is `local`; any other value makes `createStore()` throw rather than
silently doing the wrong thing.

## Stack

| Concern         | Choice                             |
| --------------- | ---------------------------------- |
| UI              | React 18 + TypeScript (strict)     |
| Build           | Vite 5                             |
| Tests           | Vitest 2 + jsdom                   |
| Data (today)    | `localStorage`, per family         |
| Data (planned)  | Supabase Postgres + RLS            |
| Blobs (today)   | Canvas resize → data URL           |
| Blobs (planned) | Supabase Storage, private bucket   |
| Auth (today)    | Fake: pick a member, per tab       |
| Auth (planned)  | Supabase Auth + family join code   |
| Prices          | Deterministic mock, `MOCK DATA`    |
| Hosting         | Static: Cloudflare Pages or Vercel |

Runtime dependencies: `react`, `react-dom`. Nothing else.

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
  data/                      Collection/DataStore/BlobStorage, local backend,
                             the swap point, useCollection, the contract.
  auth/session.tsx           SessionProvider / useSession (fake for now).
  prices/                    PriceProvider + deterministic mock.
  features/board/            The kanban board.
  components/                Shared UI. Empty.
  App.tsx  main.tsx  styles.css   Shell; App mounts the board.
supabase/schema.sql          Target Postgres schema. NOT applied anywhere.
docs/ARCHITECTURE.md         The long version, including the Supabase path.
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
- **~5 MB of storage.** `localStorage` is capped around 5 MB per origin and
  photos are inline data URLs, so images fill it quickly.
- **Last write wins.** No merge, no conflict detection.
- **Same-browser sync only.** The `storage` event reaches other tabs, not other
  devices.
- **Prices are fake**, and labelled as such.
- **No recurring tasks yet.** The board is the base; recurrence comes next.
