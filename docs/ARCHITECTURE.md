# Nestead architecture

Nestead is a shared home-organisation app for one family: a kanban board of
household tasks, a shopping list for everything the house needs, and a
kitchen (Larder) of recipes, pantry and diet profile, all shared by everyone in
the family.

Scope is kept to what exists. Prices are planned but unbuilt, so they appear
neither in the schema nor in the types: a table with no feature behind it is a
guess that later has to be migrated.

This document describes the **core** — the data layer, session and contracts —
and the kanban board that sits on top of it. Further features get added the
same way the board was, without changing anything the core guarantees.

## Stack

| Concern         | Choice                        | Notes                                              |
| --------------- | ----------------------------- | -------------------------------------------------- |
| UI              | React 18 + TypeScript strict  | `noUnusedLocals`, ES modules                        |
| Build           | Vite 5                        | `npm run build` = `tsc --noEmit && vite build`      |
| Tests           | Vitest 2 + jsdom              | `npm test`                                          |
| Data            | Supabase Postgres + RLS       | `src/data/supabase/supabaseStore.ts`, `supabase/schema.sql` |
| Data (demo)     | `localStorage`                | `src/data/local/localStore.ts`                      |
| Auth            | Supabase Auth, one account per person | `src/auth/accountSession.tsx` over `src/data/supabase/supabaseAccount.ts` |
| Auth (demo)     | None: pick a member per tab   | `src/auth/demoSession.tsx`                          |
| Text            | i18next: English bundled, Hebrew fetched on first use | `src/i18n/`                 |
| Hosting         | Cloudflare Pages               | static, plus Pages Functions: `/api/import`, `/api/search`, `/api/places`, `/api/ai` |

The deploy workflow builds with `VITE_BACKEND=supabase`
(`.github/workflows/deploy.yml`), and `npm run build` refuses anything else
(`vite.config.ts`), so the demo backend is for development only.

Runtime dependencies are `react`, `react-dom`, `react-router-dom`,
`@supabase/supabase-js`, `i18next`, `react-i18next`, `lucide-react` and six
self-hosted font packages: Newsreader and Hanken Grotesk, plus Noto Arabic and
Hebrew faces for text in those scripts (`src/styles/fonts.css`). Everything else
is a dev dependency, including PGlite, which runs the SQL tests for the AI
functions in `tests/sql/`.

## Principles

1. **Screens never touch storage.** A feature reads and writes rows only through
   `useSession()` and `useCollection()` (or `useKitchen()`, built on them). No
   feature imports `localStorage` or a Supabase client; the one thing screens
   take from a backend module is the device-preference helpers in
   `src/data/local/localStore.ts`. `src/data/boundary.test.ts` fails if any
   file outside `src/data/supabase/` imports the Supabase SDK or that folder,
   bar the swap point.
2. **Every row is family-scoped.** `Base` carries `familyId`, every store is
   built for one family, and the target SQL enforces the same rule with RLS.
   There is no code path that returns another family's rows.
3. **The backend is chosen in one place and must pass the same contract.**
   `SessionProvider` in `src/auth/session.tsx` picks by `VITE_BACKEND`: the demo
   session over a cached local store, or `AccountSession` over a backend's
   `Account` (sign-in, families, and `openStore()` for the signed-in family's
   `DataStore`). A backend qualifies once its store passes
   `runDataStoreContract()` unchanged. See
   [Swapping the backend](#swapping-the-backend).
4. **Domain types mirror the SQL schema.** `src/domain/types.ts` and
   `supabase/schema.sql` are the same shapes — camelCase in TypeScript,
   snake_case in Postgres. Change one, change the other.
5. **Features are additive.** New screens go in `src/features/`, shared widgets
   in `src/components/ui/`. Adding a feature must not require editing the data
   layer, the session, or the contract.

## File layout

```
src/
  main.tsx                   Entry: providers, fonts, and the global stylesheets.
  app/
    App.tsx                  The signed-in app: KitchenProvider around the Shell.
    Shell.tsx                The frame: sidebar or tab bar, page pills, the page, timers.
    Nav.tsx                  Sidebar, TabBar, More and page pills, from sections.ts.
    sections.ts              Every section and its pages; which is lit; pin rules.
    AppRoutes.tsx            Every route; kitchen screens load lazily.
  auth/
    session.tsx              SessionProvider / useSession: the Session shape.
    demoSession.tsx          Local backend: pick a member per tab.
    accountSession.tsx       Real sign-in over any backend's Account: one account per person.
    openFamily.ts            Membership plus the family's cached, preloading store.
    invite.ts                Invite links: /join/<code>, kept until the join screen uses it.
    useInviteFamily.ts       Names the family behind an invite code, signed out.
    screens/                 SignIn, JoinOrCreate, SetNewPassword.
    auth.css                 Styles for those screens (global class names).
  data/
    types.ts                 Collection, DataStore and Account: what a backend provides.
    boundary.test.ts         Only supabase/ may know about Supabase.
    cache.ts                 Shared rows per collection, over any backend:
                             one read for every screen, writes shown at once.
    useCollection.ts         Hook: live rows from a Collection, via the cache.
    collection.contract.ts   runDataStoreContract() — the backend contract.
    local/                   localStorage backend, IndexedDB photos, and the
                             preference helpers (per family and per device).
    supabase/                The Supabase adapter: client, store, account, live suites.
  domain/
    types.ts                 Entities and Base/NewRow. Mirrors the SQL schema.
    position.ts              Sparse ordering for board rows and list sections.
    shows.ts                 Shows: filters, sorts, the status cycle, the refresh patch.
    kitchen/                 Pure kitchen logic, unit-tested: catalog, parser,
                             pantry fit and rows, store sections, diet,
                             scaling, durations, calories, shopping list, search.
  components/
    ui/                      The generic kit, one file per family (Button, Chip,
                             controls, Sheet, …) behind an index barrel.
    theme/                   ThemeProvider and ThemeToggle.
    Brand, PageHeader, ErrorBoundary
  hooks/                     useMediaQuery, useIsNarrow, useDirection, useWakeLock,
                             and pointerDrag.ts (shared by the two drags).
  i18n/                      i18next, LocaleProvider (lang and dir), Intl
                             formatting; locales/en.json bundled, he.json lazy.
  ai/                        Browser client for /api/ai: sends the member's
                             token, returns a typed outcome, words every error.
  features/
    board/                   The kanban board: drag and drop, filter, repeating
                             chores, actions, default columns, board.css (global).
    family/                  The Family page: invite link, join code, members,
                             theme and language.
    lists/                   The shopping list: page, rows, item and section
                             forms, section drag.
    activities/shows/        Shows: page, cards, add sheet, /api/shows client, writes.
    larder/
      KitchenContext.tsx     The kitchen's rows, read once for every screen.
      actions.ts             Writes that span collections (list and pantry).
      setup.ts               ensureKitchen(): a new family's profile and staples.
      labels.ts              Translated words for the domain's fixed ids.
      recipe/                Recipe presentation the screens share: card, photo,
                             badges, stars, match bar, status marker, step
                             text, servings, the view model.
      library/ search/ detail/ add/ import/ pantry/ profile/ cook/
                             One folder per screen.
      timers/                Cook-mode timer engine and host.
      seed/                  The demo family's kitchen, and the offline web index
                             every build ranks on Search; "Search online" falls
                             back to it where online search is not set up.
  styles/
    tokens.css               The palette and type for the whole app.
    global.css               Un-scoped rules shared across features.
    fonts.css                Arabic and Hebrew fallback faces.
server/import/               Recipe import: guard (SSRF), fetchPage, parse,
                             handler; index.ts is the public surface.
functions/api/import.ts      The same handler as a Cloudflare Pages Function.
server/search/               Recipe search: Tavily, limited to the recipe sites
                             in sites.ts; index.ts is the public surface.
functions/api/search.ts      The same handler as a Cloudflare Pages Function.
server/shows/                Shows API: search and one title's details from a
                             ShowsProvider (OMDb, chosen in provider.ts),
                             normalised; index.ts is the public surface.
functions/api/shows.ts       The same handler as a Cloudflare Pages Function.
server/places/               Address suggestions: the AddressProvider interface,
                             Photon behind it, chosen in provider.ts.
functions/api/places.ts      The same handler as a Cloudflare Pages Function.
server/ai/                   AI recipe reading: OpenRouter client, prompt and
                             output validation, page text, key encryption, the
                             Supabase store; index.ts is the public surface.
functions/api/ai/[[path]].ts The same handler as a Cloudflare Pages Function
                             (a catch-all file, since it answers two routes).
supabase/schema.sql          Postgres schema; migrations/ for existing projects.
```

**Folder guides:** [src/ai](../src/ai/README.md) · [src/app](../src/app/README.md) ·
[src/auth](../src/auth/README.md) · [src/components](../src/components/README.md) ·
[src/data](../src/data/README.md) · [src/domain](../src/domain/README.md) ·
[src/i18n](../src/i18n/README.md) · [features/board](../src/features/board/README.md) ·
[features/family](../src/features/family/README.md) · [features/lists](../src/features/lists/README.md) ·
[features/activities](../src/features/activities/README.md) ·
[features/larder](../src/features/larder/README.md) and its
[add](../src/features/larder/add/README.md), [cook](../src/features/larder/cook/README.md),
[import](../src/features/larder/import/README.md), [pantry](../src/features/larder/pantry/README.md),
[recipe](../src/features/larder/recipe/README.md), [search](../src/features/larder/search/README.md),
[seed](../src/features/larder/seed/README.md), [timers](../src/features/larder/timers/README.md) ·
[server/import](../server/import/README.md) · [server/search](../server/search/README.md) ·
[server/shows](../server/shows/README.md) ·
[server/ai](../server/ai/README.md) · [supabase](../supabase/README.md).

Dependencies point one way: `features` use `components`, `hooks`, `i18n`, `data`
and `domain`; `domain` imports nothing outside `domain/`. A screen does not reach
into another screen's file: what two screens share lives in a shared folder
(`larder/recipe/`) or in `domain/`. The shopping list borrows `larder/recipe/`,
`KitchenContext` and `larder/actions.ts` because recipes write to the list, and
`insertionBefore()` from `board/dragDrop.ts` for its section drag. The one
screen-to-screen import is the import screen's hand-off to `add/`: the
`ImportHandoff` type and `UNITS`.

**Styles.** Components use CSS modules. The board and the sign-in screens still
use global class names; their sheets live with them but are imported in
`main.tsx` after everything else, so the cascade is what it was when they were
one file.

## The board

Columns are rows in `board_columns`, so a family adds, renames, reorders and
deletes its own. One is seeded (To do) and only when a family
has none at all — matching on name would re-create a column somebody renamed.

Ordering uses sparse positions: a row moved between two neighbours takes their
midpoint, so one move rewrites one row rather than renumbering a column. Ties,
which two clients can produce under last-write-wins, break on `createdAt` then
`id` so every device shows the same order. See `src/domain/position.ts`.

Done is a tick on the card, not a column. `BoardColumn` is a name and a
position, so a family can rename, add and delete columns and still finish tasks,
and `Task.done` is written only by the tick, an untick, a repeat coming back and
a restore (`features/board/actions.ts`); a move (`placeTask()`) never touches it.
The tick is a badge on the card's emoji. It writes two rows with no
transaction: a history entry (a copy of the task, and who ticked it), then
`done`, `doneAt` and `completionId` on the task, so an untick can remove exactly
that entry. If the second write fails, History has a tick the board does not.

Done cards fold under their own column as "Done (n)", closed whenever the board
loads, newest first, and cannot be dragged (untick first). Clear in the fold
deletes its done one-offs, and `autoClear()` does the same on load for those
ticked more than a week ago. A repeating chore is never cleared, since it comes
back on its own. Clearing deletes the task, never its history.

History is its own page in the Board section (`features/board/history/`). Every
tick is a `TaskCompletion` row, so a repeating chore shows every round, and the
page lists them by day with who did them. Restore means "do it again": it
unticks a task still on the board, or creates a cleared one again from the
entry's copies and points every entry of the old task at the new one, and the
entry stays. The board never reads this collection (D8 in [the
design](superpowers/specs/2026-10-10-board-done-tasks-design.md)): ticking
creates an entry and unticking removes one by id, and only the History page
lists them, so the board does not slow down as history grows. An
entry keeps a plain `taskId`, with no foreign key, because clearing a task must
not blank its history. The page does read every entry; at about ten ticks a day
that is a few thousand small rows a year, and loading only recent ones is the
follow-up if it drags.

Deleting a column with tasks in it is blocked rather than cascading. The target
schema agrees: `tasks.column_id` is `on delete restrict`.

Cards move by dragging, within a column or to another (`useTaskDrag.ts`). It is
built on pointer events rather than HTML5 drag and drop, which does nothing on
phones: a mouse lifts a card once it moves 5px, a finger after resting on it for
350ms, since a finger that moves at once is scrolling. `dropPosition()` in
`dragDrop.ts` works out where a card lands without the DOM, and a card put back
where it was writes nothing. Cards have no keyboard way to move at present;
columns still move with their arrow buttons (`Column.tsx`).

A repeating chore is one row that comes back round (`recurrence.ts`): ticking it
leaves `dueDate` on the round it covered, `returnDate()` works out the next date
on its schedule after that round and the day it was done, counted from
`recurFrom` so a chore on the 31st returns to the 31st, and `reviveRecurring()`
unticks it in place, in its own column, when the board next opens on or after
that date. There is no server job.

Below 768px the columns stop sitting side by side and stack into collapsible
sections, all open to start with. A horizontally scrolling board on a phone
shows one column at a time and tells you nothing about the others, whereas
stacked headers keep every column and its count on screen. `useIsNarrow()` is a
hook rather than pure CSS because the change is behavioural, not cosmetic: the
header expands the section instead of renaming it, renaming moves to its own
control, and the move arrows point up and down rather than left and right.

## The kitchen (Larder)

The kitchen is five family-scoped collections on the same `DataStore`, plus a
photo store. The shopping list's two are here because recipes write to it,
though the list itself is for anything and its screen is `features/lists/`:

| Collection      | Table           | Holds                                                     |
| --------------- | --------------- | --------------------------------------------------------- |
| `recipes`       | `recipes`       | Recipes; ingredient lines, steps and tags as jsonb         |
| `pantry`        | `pantry_items`  | "Have now" (`kind = 'have'`) and staples (`'staple'`)     |
| `dietProfiles`  | `diet_profiles` | One row per family (unique `family_id`)                    |
| `listItems`     | `list_items`    | Shopping list rows; `parts` records which recipe needs what |
| `listGroups`    | `list_groups`   | Sections the family added, in the family's order; built-in Supermarket and General get a row (`builtin`) only once moved |
| `photos`        | Storage bucket  | `recipe-photos/<family_id>/<uuid>.jpg`, private            |

Nested structures are jsonb and keep their camelCase keys inside: they are
always read and written whole with their row, never queried on their own. Only
top-level keys are mapped to snake_case, as before.

Photos are not rows. The local backend keeps them in IndexedDB (localStorage
would fill up after two or three); the Supabase backend uses a private bucket
whose storage policies only admit the member's own family folder, the same
boundary `family_id` draws for rows. Photos are resized in the browser to 1600px
JPEGs before they are stored.

**Setting up a family's kitchen.** The diet profile row is the marker: a family
with one has been set up. `ensureKitchen()` runs at sign-in and, for a family
without one, creates an empty profile and the eight default staples. The
unique constraint means two devices racing to do it cannot both succeed. It
never throws: a kitchen that cannot be set up must not keep anyone off the
board. The demo family gets the full seed instead (`seedDemoKitchen()`).

**Pure logic lives in `src/domain/kitchen/`**, with no React and no storage:
the ingredient catalog (about 280 items with store section, diet flags, calories,
carbs, unit weights and the water dry grains take up), the ingredient-line
parser, pantry fit, the diet engine, scaling and formatting, timer detection in
step text, calorie estimates per serving and per 100 g, the shopping-list merge
and search. All of it is unit-tested, including the numbers
the design shows, computed from the seed rather than typed in.

**Cook-mode timers are per device**, in `features/larder/timers/store.ts`, kept
through `readPreference`/`writePreference` under the scope `device`, never in
the `DataStore`. A running timer stores when it ends, never time left, so it
stays right in a background tab and after a reload. `TimerHost` in the shell
ticks them and raises the alert on whatever screen is open.

**Recipe import** is `server/import/`, a `(Request) => Promise<Response>`
handler with no dependencies. It runs as a Cloudflare Pages Function
(`functions/api/import.ts`, deployed by the existing `wrangler pages deploy`)
and as Vite middleware under `npm run dev` and `vite preview`. It reads
schema.org JSON-LD, falling back to microdata, and refuses non-http(s) URLs,
private, loopback and link-local addresses (re-checked on every redirect),
pages over 5 MB and anything slower than 10 seconds. Ingredient lines come back
as text; the app parses them with the same parser it uses everywhere.

**Recipe search** ("Search online") is `server/search/`, the same shape of
handler, as `functions/api/search.ts` and the same Vite middleware. It asks
Tavily's search API (free: 1,000 searches a month), limited to recipe sites the
importer was checked against: English ones, or Hebrew ones when the query has
Hebrew letters (`sites.ts`). It returns links, not recipes; the one a person
picks goes through `/api/import` like a pasted link. The key is the server-only
`TAVILY_API_KEY` (`.env.local` locally, a Pages secret in production). Without
it the endpoint answers `not-configured` and the screen searches the bundled
web index instead. Hebrew lines match the catalog through
`domain/kitchen/hebrewNames.ts`, read from their first word since Hebrew puts
the noun first; a recipe in a language the catalog has no names for is not
checked against the pantry or diet, and the preview says so
(`mostlyUnrecognised()` in `features/larder/import/imported.ts`).

**AI reading** is `server/ai/`, the same shape of handler again.
`POST /api/ai/extract` takes pasted text or a link the importer cannot read;
`POST /api/ai/key` saves a family's own OpenRouter key. Supabase is called with
the member's own token. A read is one OpenRouter call that must answer in a closed
JSON schema, with no tools. It is free on Nestead's key and `:free` models, 5
reads per person and 45 for the app per UTC day, counted in the database; a family
may add its own key, which the server encrypts (AES-GCM under `AI_KEY_SECRET`) so
Postgres holds ciphertext only. The answer is validated into `ImportedRecipe`,
never repaired, and nothing is saved until the person confirms the preview. See
[the design](superpowers/specs/2026-10-03-ai-recipe-extraction-design.md).

**Screens load lazily.** The board is home, so each kitchen screen is its own
chunk, fetched on first visit. An error boundary around the routes turns a
chunk that has gone missing (a tab left open across a deploy) into a Reload
button rather than a blank page.

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
- A patch value of `undefined` clears that field; a key left out of the patch
  is left alone.
- `remove` of a row that is already gone resolves rather than throwing: two
  devices clearing the same old tasks both delete them.
- `subscribe` fires after any change to that collection **including changes
  made by another tab or another client**, and stops firing after its
  unsubscribe is called. The local backend gets this from the window `storage`
  event, Supabase from a realtime channel filtered by `family_id`.
- A store built for family A never returns, updates or deletes family B's rows.

`make(familyId)` must hand back a store that is genuinely *authorised* for that
family rather than one that merely names it. The local backend can fabricate
either on demand; under RLS a client cannot, since a signed-in user belongs to
one family and asserting another gets you nothing. So an auth-backed backend
signs in as a user who belongs to that family, and `make` may be async for it.

`runDataStoreContract(name, make, reset?)` in
[collection.contract.ts](../src/data/collection.contract.ts) is the executable
form of that list: sixteen Vitest cases, run against the local backend by
[localStore.test.ts](../src/data/local/localStore.test.ts), against the same
backend through the cache by [cache.test.ts](../src/data/cache.test.ts), and
against a live project by
[supabaseStore.test.ts](../src/data/supabase/supabaseStore.test.ts). The
cross-client half of `subscribe` is checked separately, for Supabase, by
[supabaseRealtime.test.ts](../src/data/supabase/supabaseRealtime.test.ts).

### `useSession()`

Returns a `Session` (`src/auth/session.tsx`): `store`, `me`, `members` and
`signOut` always; `setMe` in demo mode only; `family`, `rotateJoinCode`,
`refreshFamily` and `ai` with Supabase only (real accounts; `ai` is the token for
`/api/ai` and the family's AI settings, so the demo has no AI reading). Screens
depend on this shape, never on which session provides it.

## The Supabase backend

Production runs on Supabase; the local backend stays for development with no
project and no network.

1. **Schema.** `supabase/schema.sql` builds a fresh project: tables, RLS and
   policies, `updated_at` triggers, `create_family()` / `join_family(code)` /
   `rotate_join_code()` / `invite_family_name(code)`, the realtime publication
   and the photo bucket's policies. Apply it in one run, since a table that
   exists before its policy is briefly world-readable. An existing project takes
   the files in `supabase/migrations/` instead; each is already folded into
   `schema.sql`.
2. **Config.** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` go in
   `.env.local` (see `.env.example`); the deploy workflow takes them from
   repository variables. Only the publishable key may ever be a `VITE_*` value:
   every `VITE_*` is inlined into the public bundle, and the workflow refuses a
   key that looks secret.
3. **Backend.** `createSupabaseStore(familyId, client)` in
   `src/data/supabase/supabaseStore.ts` maps camelCase to snake_case at this
   boundary and nowhere else, top-level keys only. `list()` reads in pages of
   1000 rows ordered by `id` until one comes back short, since PostgREST
   silently answers no more than the project's Max Rows (1000 by default) and
   `task_completions` grows without bound. `subscribe` is a realtime channel
   filtered by `family_id`; photos go to the private `recipe-photos` bucket.
4. **Contract.** `supabaseStore.test.ts` runs `runDataStoreContract()` against a
   test project as two users in two families, with credentials from the
   gitignored `.env.test` (see `.env.test.example`); without it the suite skips.
   The contract does not change: if a case fails, the backend is wrong, not the
   contract. Between cases the suite deletes every task, column and kitchen row
   in both test families, so use throwaway accounts.
5. **Session.** `AccountSession` (`src/auth/accountSession.tsx`), over
   `supabaseAccount()` (`src/data/supabase/supabaseAccount.ts`), signs in with
   email and password, **one account per person**. Not a shared family
   password: a shared secret cannot be revoked for one person, gives no
   attribution, and would make `members.id = auth.users.id` meaningless
   (`src/auth/screens/SignIn.tsx`).
   - Signed in but in no family, a person runs `create_family()` or
     `join_family(code)` (`JoinOrCreate.tsx`). An invite link, `/join/<code>`,
     opens sign-up naming the family (`invite_family_name()`, callable signed
     out) with the code filled in.
   - `<site>/join/**` must be in Supabase Auth's redirect URLs
     (`supabase/config.toml`) so the confirmation email returns to the invite;
     without it the email goes to the Site URL, and only the device that opened
     the link still has the code.
   - Once in a family, `AccountSession` builds the cached store for the
     member's `family_id`; `me` is the signed-in member and there is no `setMe`.
6. **The demo.** `DemoSession` and its seed stay for local development. A
   Supabase build leaves them out of the bundle (`src/auth/session.tsx`), and
   `npm run build` refuses to build without `VITE_BACKEND=supabase`
   (`vite.config.ts`).

## Swapping the backend

Supabase is one adapter, `src/data/supabase/`, behind two interfaces in
`src/data/types.ts`: `DataStore` (a family's rows and photos) and `Account`
(sign-in, families, and `openStore()`). Nothing else imports it but
`SessionProvider`, and `src/data/boundary.test.ts` keeps it that way. To move
to another backend:

1. **Store.** Implement `DataStore` and pass `runDataStoreContract()` unchanged
   (copy `src/data/supabase/supabaseStore.test.ts`). Mind what the contract
   cannot check: a patch value of `undefined` clears the field; `subscribe`
   hears other clients' changes; an `update` of a missing row throws.
2. **Account.** Implement `Account`. Its doc comment lists what the backend,
   not the client, must enforce: a member's id is their user id, one family per
   person, rows visible only to their family, one diet profile per family. On
   Supabase those are RLS policies, unique constraints and the
   `security definer` functions in `supabase/schema.sql`.
   `src/auth/accountSession.test.tsx` runs the session over an in-memory
   `Account`; the same flows should work over yours.
3. **Switch.** Add a `VITE_BACKEND` case in `src/auth/session.tsx` and the
   value to `src/vite-env.d.ts`, and update the build check in
   `vite.config.ts`, which insists on `VITE_BACKEND=supabase` and its two keys.
4. **Data.** Move the rows across. `src/domain/types.ts` is the shape to map
   to; photo ids are opaque strings the store hands out, so a store may keep
   Supabase's `<familyId>/<uuid>.jpg` or rewrite them in the migration.
5. **What stays Supabase-specific** and is fine to delete with it:
   `supabase/`, `scripts/perf/db.perf.ts`, the `SUPABASE_TEST_*` variables, and
   the `supabase` chunk in `vite.config.ts`.

The demo backend (`src/data/local/`, `src/auth/demoSession.tsx`) is a second
`DataStore` that already passes the contract, so the store half has been
swapped before.

## Known limits

- **Demo mode has no auth.** With the local backend, anyone who opens the app is
  in the demo family and can be anyone in it. Production builds cannot use it.
- **Demo storage is ~5 MB.** `localStorage` is capped at roughly 5 MB per
  origin. Ample for text, but writes fail once it is full and the local backend
  evicts nothing. Photos are in IndexedDB instead.
- **Last write wins, per field.** There is no merge or conflict detection. A
  patch replaces the fields it names, and nested structures (ingredient lines,
  list parts) are replaced whole, so two people changing the same field at once
  keep only the later change. Both backends behave the same.
- **Demo sync is same-browser only.** The `storage` event reaches other tabs on
  the same device, not other devices. With Supabase, realtime reaches every
  signed-in member.
- **No offline use.** There is no service worker: the app installs to a home
  screen (`public/manifest.webmanifest`) but does not load offline.
- **No prices.** Adding a table before the feature that uses it is a guess you
  later have to migrate, so costs wait for a feature that needs them.
