# Nestead architecture

Nestead is a shared home-organisation app for one family. Today it is a kanban
board of household tasks, shared by everyone in the family.

Scope is kept to what exists. Recipes, shopping lists, photos and prices are
planned but unbuilt, so they appear neither in the schema nor in the types: a
table with no feature behind it is a guess that later has to be migrated.

This document describes the **core** — the data layer, session and contracts —
and the kanban board that sits on top of it. Further features get added the
same way the board was, without changing anything the core guarantees.

## Stack

| Concern         | Choice                        | Notes                                              |
| --------------- | ----------------------------- | -------------------------------------------------- |
| UI              | React 18 + TypeScript strict  | `noUnusedLocals`, ES modules                        |
| Build           | Vite 5                        | `npm run build` = `tsc --noEmit && vite build`      |
| Tests           | Vitest 2 + jsdom              | `npm test`                                          |
| Data (today)    | `localStorage`                | `src/data/localStore.ts`                            |
| Data (planned)  | Supabase Postgres + RLS       | `supabase/schema.sql`, not applied                  |
| Auth (today)    | Fake: pick a member per tab   | `src/auth/session.tsx`                              |
| Auth (planned)  | Supabase Auth + family join code | one account per person                           |
| Hosting         | Static (Cloudflare Pages / Vercel) | no server of our own                           |

Runtime dependencies are `react` and `react-dom`. Everything else is a dev
dependency.

## Principles

1. **Screens never touch storage.** A feature reads and writes only through
   `useSession()` and `useCollection()`. No component imports `localStorage`, a
   backend module, or a Supabase client.
2. **Every row is family-scoped.** `Base` carries `familyId`, every store is
   built for one family, and the target SQL enforces the same rule with RLS.
   There is no code path that returns another family's rows.
3. **Backends swap in one place and must pass the same contract.** The only
   place that decides which backend exists is `createStore()` in
   `src/data/index.ts`; a backend qualifies once it passes
   `runDataStoreContract()` unchanged.
4. **Domain types mirror the SQL schema.** `src/domain/types.ts` and
   `supabase/schema.sql` are the same shapes — camelCase in TypeScript,
   snake_case in Postgres. Change one, change the other.
5. **Features are additive.** New screens go in `src/features/`, shared widgets
   in `src/components/`. Adding a feature must not require editing the data
   layer, the session, or the contract.

## File layout

```
src/
  domain/
    types.ts                 Entities and Base/NewRow. Mirrors the SQL schema.
    position.ts              Sparse ordering for board rows.
  data/
    types.ts                 Collection and DataStore interfaces.
    localStore.ts            localStorage backend. The only localStorage user.
    index.ts                 THE swap point: createStore().
    useCollection.ts         Hook: live rows from a Collection.
    collection.contract.ts   runDataStoreContract() — the backend contract.
    localStore.test.ts       Runs the contract against the local backend.
  auth/session.tsx           SessionProvider / useSession. Fake session.
  components/                Shared UI. Empty.
  features/board/            The kanban board: Board, Column, TaskCard,
                             actions.ts (moves) and icons.ts (emoji set).
  App.tsx  main.tsx  styles.css   Shell; App mounts the board.
supabase/schema.sql          Target Postgres schema. Not applied.
```

## The board

Columns are rows in `board_columns`, so a family adds, renames, reorders and
deletes its own. Three are seeded (To do / Doing / Done) and only when a family
has none at all — matching on name would re-create a column somebody renamed.

Ordering uses sparse positions: a row moved between two neighbours takes their
midpoint, so one move rewrites one row rather than renumbering a column. Ties,
which two clients can produce under last-write-wins, break on `createdAt` then
`id` so every device shows the same order. See `src/domain/position.ts`.

`BoardColumn.isDone` and `Task.done` are deliberately redundant: the column is
the source of truth and `moveTaskToColumn()` in `features/board/actions.ts` is
the only thing that writes either, so they cannot drift. Worth revisiting if
`done` never earns its keep independently.

Deleting a column with tasks in it is blocked rather than cascading. The target
schema agrees: `tasks.column_id` is `on delete restrict`.

There is no drag and drop. Cards move by an explicit column picker and up/down
buttons, which works on touch, works with a keyboard, and needs no dependency.
A drag layer can be added later without touching any stored data.

Below 768px the columns stop sitting side by side and stack into collapsible
sections, with Done folded by default. A horizontally scrolling board on a phone
shows one column at a time and tells you nothing about the others, whereas
stacked headers keep every column and its count on screen. `useIsNarrow()` is a
hook rather than pure CSS because the change is behavioural, not cosmetic: the
header expands the section instead of renaming it, renaming moves to its own
control, and the move arrows point up and down rather than left and right.

## Contracts

### `Collection<T>`

```ts
list(): Promise<T[]>
create(row: NewRow<T>): Promise<T>
update(id: string, patch: Partial<NewRow<T>>): Promise<T>
remove(id: string): Promise<void>
subscribe(onChange: () => void): () => void
```

Guarantees every backend owes:

- `create` fills `id`, `familyId`, `createdAt` and `updatedAt`; callers supply
  only domain fields.
- `update` merges the patch, bumps `updatedAt`, leaves `createdAt` alone, and
  rejects for an unknown id. `id` and `familyId` are never patchable. Postgres
  returns success with no rows for an update that matches nothing, so a SQL
  backend has to detect that and throw rather than pass it off as a success.
- `subscribe` fires after any change to that collection **including changes
  made by another tab or another client**, and stops firing after its
  unsubscribe is called. The local backend gets this from the window `storage`
  event; Supabase will get it from the realtime publication.
- A store built for family A never returns, updates or deletes family B's rows.

`make(familyId)` must hand back a store that is genuinely *authorised* for that
family rather than one that merely names it. The local backend can fabricate
either on demand; under RLS a client cannot, since a signed-in user belongs to
one family and asserting another gets you nothing. So an auth-backed backend
signs in as a user who belongs to that family, and `make` may be async for it.

`runDataStoreContract(name, make, reset?)` in
[collection.contract.ts](../src/data/collection.contract.ts) is the executable
form of that list: seven Vitest cases, run today by
[localStore.test.ts](../src/data/localStore.test.ts).

### `useSession()`

Returns `{ store, me, members, setMe }`. This shape is fixed: real auth replaces
the internals of `session.tsx` only.

## Adding Supabase

Each step is separately shippable; the app keeps working on the local backend
throughout.

1. **Apply the schema.** `supabase/schema.sql` is complete: tables, RLS and
   policies, `updated_at` triggers, `create_family()` / `join_family(code)` /
   `rotate_join_code()`, and the realtime publication. Apply it in one run,
   since a table that exists before its policy is briefly world-readable. Then
   confirm RLS is on for every table and that a second account sees nothing of
   the first family.
2. **Add config.** Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in
   `.env.local` (see `.env.example`). Only the anon key may ever be a `VITE_*`
   value — every `VITE_*` is inlined into the public bundle. A service-role key
   must never appear in this repo or in any client config.
3. **Write the backend.** Add `src/data/supabaseStore.ts` exporting
   `createSupabaseStore(familyId)`. Map camelCase to snake_case at this
   boundary and nowhere else. Back `subscribe` with a realtime channel filtered
   by `family_id`.
4. **Make it pass the contract.** Add `src/data/supabaseStore.test.ts` calling
   `runDataStoreContract('supabase', createSupabaseStore, reset)` against a test
   project. The contract does not change — if a case fails, the backend is
   wrong, not the contract.
5. **Add the case in `src/data/index.ts`.** One `case 'supabase':` in
   `createStore()`. This is the only file in `src/` that learns a second backend
   exists.
6. **Replace the session internals.** Keep `SessionProvider` / `useSession` and
   their `{ store, me, members, setMe }` shape. Inside:
   - sign in with Supabase Auth, **one account per person** — email/magic link.
     Not a shared family password: a shared secret cannot be revoked for one
     person, gives no per-person attribution, and makes `members.id =
     auth.users.id` meaningless;
   - on first sign-in, `create_family()` or `join_family(code)` decides which
     family the person belongs to;
   - `familyId` comes from the signed-in member's row, not from a constant;
   - `me` is the signed-in member; `setMe` becomes sign-out/switch-account, or
     goes away — that change is visible to screens, so do it deliberately.
7. **Delete the demo seed** once real families exist.

## Known limits

- **Auth is fake.** Anyone who opens the app is in the demo family and can be
  anyone in it. There is no access control of any kind until step 7 above.
- **Storage is ~5 MB.** `localStorage` is capped at roughly 5 MB per origin.
  Ample for a board of text, but writes fail once it is full and the local
  backend evicts nothing.
- **Last write wins.** There is no merge or conflict detection. Two tabs editing
  the same row: the later `update` overwrites the earlier one wholesale. The
  same will be true of the first Supabase backend.
- **Sync is same-browser only.** The `storage` event reaches other tabs on the
  same device, not other devices. Real sharing between two people starts at
  step 3.
- **Board and people only.** Recipes, shopping lists, photos and prices are not
  built, and are deliberately absent from the schema and the types until they
  are. Adding a table before the feature that uses it is a guess you later have
  to migrate.
