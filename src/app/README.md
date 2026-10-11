# app
The signed-in app's frame: the shell around every screen, the sidebar and tab bar, and the route table.

## Files
| File | Responsibility |
| --- | --- |
| `App.tsx` | Wraps `Shell` in `KitchenProvider`, so kitchen rows are read once for every screen and the nav. |
| `Shell.tsx` (+ `Shell.module.css`, also used by `Nav.tsx`) | Sidebar or tab bar, `PagePills` above the page wherever the tab bar shows, the routed page inside `ErrorBoundary`, and `TimerHost`. |
| `sections.ts` | Every section and its pages (`SECTIONS`), `locate()` for which is lit, and the pin rules (`resolvePins()`, `togglePin()`). No React. |
| `Nav.tsx` | `Sidebar`, `TabBar` with its More sheet, and `PagePills`, all drawn from `SECTIONS`; counts and the diet-rules link; every link warms its page (`useWarm()`). |
| `warm.ts` (+ `warm.test.ts`) | `warmPage(path, store)`: what a page needs that sign-in did not start, begun as someone heads for its link. Shows: its chunk (`loadShows()`) and its collection (`preloadCollection()`). History: its collection, `taskCompletions`, which sign-in does not read. |
| `update.ts` (+ `update.test.ts`) | `watchForUpdates()`: notices a deploy (another build in `/version.json`) and reloads the tab at a moment that loses nothing; `hasTypedText()`; `BUILD`, this bundle's id. No React. |
| `UpdateWatcher.tsx` (+ `UpdateWatcher.test.tsx`) | Starts `watchForUpdates()` for the whole app, signed in or not, and reports each move to another page (a new `pathname`). |
| `AppRoutes.tsx` | Every route; kitchen screens, Shows, `HistoryPage`, `FamilyPage` and `AddressesPage` load as `lazy()` chunks. `ShowsRoute` renders Shows directly when its chunk has already arrived. |

## How it works
- `main.tsx` renders `LocaleProvider` → `ThemeProvider` → `BrowserRouter` → `SessionProvider` → `App`, so nothing here renders before a session exists. `UpdateWatcher` sits beside `SessionProvider` inside the router, so the sign-in screens are watched too.
- Deploys (`update.ts`): there is no service worker, and a phone keeps a tab or a home-screen app open for days, so an old build ran on after a deploy until its writes failed against the new schema (2026-10-11: New column on a phone, `../../supabase/README.md`). Each build carries an id, in the bundle and in `/version.json` (`buildVersion()` in `../../vite.config.ts`; `../../public/_headers` makes it `no-store`). The tab asks for it when shown again (or back from the back-forward cache), when back online, on each page change, and every 15 minutes while in view, at most once a minute. Once the server has another build, the tab reloads on the next page change, or at once after the check that found it if that check came from being shown, the connection or a page change and since then nothing was pressed or typed (`pointerdown`, `keydown`, `input`) and no text field holds text (`hasTypedText()`; numbers, dates and toggles do not count). The 15-minute check never reloads by itself. A reload first waits for writes on their way (`writesSettled()`, `../data/cache.ts`), at most 10 s.
- `AppRoutes.tsx` wraps kitchen routes in `page()`, which shows Loading until `useKitchen().loaded`, or `LoadFailed` with Try again while a first read has failed (`useKitchen().failed`); `/` (the board), `/history`, `/shows`, `/family` and `/addresses` do not wait (Shows, History and Addresses wait for their own collections instead). Unknown paths redirect to `/`.
- `Shell.tsx` drops the sidebar in cook mode (`/^\/recipe\/[^/]+\/cook/`) and the tab bar on every `/recipe/` path; `ErrorBoundary` resets when `pathname` changes.
- Sections (`sections.ts`): Board (Board, History: `/history` lists every tick, `../features/board/history/`), Lists, Larder (Library, Search, Pantry, Diet), Activities (Shows, `../features/activities/`) and Family (Settings, Addresses). The four pinnable ones are the default bar. `locate()` lights a page by its path or an `also` prefix (`/recipe`, `/add` and `/import` are Library); URLs don't name sections.
- Phone: the bar shows the pinned sections in list order, then More. More opens a `Sheet` of every section; Edit bar pins and unpins, at most `MAX_PINS` (4) and at least one, refused rather than swapped. Pins are a per-family device preference, `navPins`. More is lit in a section that isn't pinned.
- A section with more than one page shows its pages as pills at the top of `<main>` on phones; desktop hides them, since the sidebar lists them.
- Desktop: the sidebar lists every section; the one you're in opens to its pages, with counts. Sections that can't be pinned (Family) sit at the foot, and open to their pages like the rest: Family's first page, `/family`, is labelled Settings. The diet-rules link shows under Larder's pages while you're in the Larder.
- Warming (`warm.ts`): every nav link (sidebar, tab bar, More tiles) calls `warmPage()` on `pointerenter`, `pointerdown` and `focus`. For `/shows` that starts the page's chunk and its first read, so a hover (desktop) or the press before a tap's click (about 110 ms on a phone) is spent loading; measured in [PERFORMANCE.md](../../docs/PERFORMANCE.md#shows-warmed-from-its-link-2026-10-05-branch-showsprovider-and-preload). For `/history` it starts the first read of `taskCompletions` (the chunk is not warmed). Other paths have nothing to warm. Nothing warms until a pointer, a press or focus reaches a link.
- Routes and screens are listed in the [root README](../../README.md#the-kitchen-larder); why screens load lazily is in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#the-kitchen-larder).

## Connections
- Uses: `../auth/session.tsx`, `../data/useCollection.ts` (rows, `preloadCollection()` for warming, `writesSettled()` before a reload), `../data/local/localStore.ts` (preference helpers, for `navPins`), `../components/` (Brand, ErrorBoundary, ui, theme), every screen in `../features/`, `../features/larder/KitchenContext.tsx`, `../features/larder/timers/TimerHost.tsx`, `../i18n/`.
- Used by: `../main.tsx` (`App`, and `UpdateWatcher`).

## Adding a section
1. Add its routes in `AppRoutes.tsx` (kitchen data? wrap in `page()`).
2. Add an entry to `SECTIONS` in `sections.ts` and its id to `SectionId`; the first page is where it opens. Order matters: the first four pinnable sections are the default bar.
3. Add its `nav.*` labels to `en.json` and `he.json`.
4. For a count in the sidebar, add its page path to `useSectionCounts()` in `Nav.tsx`.
5. Update the default-pins test in `sections.test.ts` if the first four changed, and the tab-bar tests in `Nav.test.tsx`, which count the default tabs and unpin them one by one.

## Rules & gotchas
- A new kitchen route must go through `page()`, or it renders before the first read and flashes an empty state, or shows one in place of rows that failed to load (`AppRoutes.tsx`).
- The bar holds `MAX_PINS` (4), and Activities made the pinnable sections four, so a new pinnable section starts under More until someone pins it. Devices that already stored `navPins` keep their own choice: Activities reaches their bar only when pinned (`resolvePins()`).
- `lazy()` needs a default export: named exports are wrapped with `.then((m) => ({ default: m.X }))`; `CookMode`, `AddRecipe` and `ImportRecipe` are default exports (`AppRoutes.tsx`).
- Nav links are `<Link>` with `aria-current` set by hand: `NavLink` would also mark a section header as the current page. Pages get `"page"`; a phone tab or More gets `"true"`.
- A route no page claims fails `sections.test.ts`.
- The Board page is `end: true`, so it is lit on `/` only and `/history` lights History (`sections.ts`).
- A warmed page loads its chunk through the same function as its route (`loadShows()` in `warm.ts`), so the two share one download. `ShowsRoute` picks the direct render or `lazy()` once per visit (`useState`): switching between them on a later render would remount the page and lose its state.
- To warm another page, add its path to `WARMERS` in `warm.ts`.
- The update watch is off under `npm run dev` and in tests: only a build defines `__APP_VERSION__` and writes `version.json`. Try it on a build (`vite preview`) by editing `version.json` in the output folder; `vite preview` reads a file's size once, at start, so keep the edited one the same length. A query change is not a page change, so cook mode's `?step=` never reloads, and a reload keeps the step since it is in the URL.
- A tab reloads at most once for a given build: it records the build in `sessionStorage` (`nestead:reloadedFor`) before reloading, and if the server still sends the old bundle it stays put rather than loop. A page change still checks for a newer build after that one.
- A reload is not instant: a tab holding typed text waits for its next page change. A schema change that breaks the old build still needs the rollout order in `../../supabase/README.md`. Collections `preloadStore()` reads at sign-in need nothing; warming one only holds it open for the cache's linger.
