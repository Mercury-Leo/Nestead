# app
The signed-in app's frame: the shell around every screen, the sidebar and tab bar, and the route table.

## Files
| File | Responsibility |
| --- | --- |
| `App.tsx` | Wraps `Shell` in `KitchenProvider`, so kitchen rows are read once for every screen and the nav. |
| `Shell.tsx` (+ `Shell.module.css`, also used by `Nav.tsx`) | Sidebar or tab bar, `PagePills` above the page wherever the tab bar shows, the routed page inside `ErrorBoundary`, and `TimerHost`. |
| `sections.ts` | Every section and its pages (`SECTIONS`), `locate()` for which is lit, and the pin rules (`resolvePins()`, `togglePin()`). No React. |
| `Nav.tsx` | `Sidebar`, `TabBar` with its More sheet, and `PagePills`, all drawn from `SECTIONS`; counts and the diet-rules link; every link warms its page (`useWarm()`). |
| `warm.ts` (+ `warm.test.ts`) | `warmPage(path, store)`: what a page needs that sign-in did not start, begun as someone heads for its link. Today only Shows: its chunk (`loadShows()`) and its collection (`preloadCollection()`). |
| `AppRoutes.tsx` | Every route; kitchen screens, Shows, `FamilyPage` and `AddressesPage` load as `lazy()` chunks. `ShowsRoute` renders Shows directly when its chunk has already arrived. |

## How it works
- `main.tsx` renders `LocaleProvider` → `ThemeProvider` → `BrowserRouter` → `SessionProvider` → `App`, so nothing here renders before a session exists.
- `AppRoutes.tsx` wraps kitchen routes in `page()`, which shows Loading until `useKitchen().loaded`, or `LoadFailed` with Try again while a first read has failed (`useKitchen().failed`); `/` (the board), `/shows`, `/family` and `/addresses` do not wait (Shows and Addresses wait for their own collections instead). Unknown paths redirect to `/`.
- `Shell.tsx` drops the sidebar in cook mode (`/^\/recipe\/[^/]+\/cook/`) and the tab bar on every `/recipe/` path; `ErrorBoundary` resets when `pathname` changes.
- Sections (`sections.ts`): Board, Lists, Larder (Library, Search, Pantry, Diet), Activities (Shows, `../features/activities/`) and Family (Settings, Addresses). The four pinnable ones are the default bar. `locate()` lights a page by its path or an `also` prefix (`/recipe`, `/add` and `/import` are Library); URLs don't name sections.
- Phone: the bar shows the pinned sections in list order, then More. More opens a `Sheet` of every section; Edit bar pins and unpins, at most `MAX_PINS` (4) and at least one, refused rather than swapped. Pins are a per-family device preference, `navPins`. More is lit in a section that isn't pinned.
- A section with more than one page shows its pages as pills at the top of `<main>` on phones; desktop hides them, since the sidebar lists them.
- Desktop: the sidebar lists every section; the one you're in opens to its pages, with counts. Sections that can't be pinned (Family) sit at the foot, and open to their pages like the rest: Family's first page, `/family`, is labelled Settings. The diet-rules link shows under Larder's pages while you're in the Larder.
- Warming (`warm.ts`): every nav link (sidebar, tab bar, More tiles) calls `warmPage()` on `pointerenter`, `pointerdown` and `focus`. For `/shows` that starts the page's chunk and its first read, so a hover (desktop) or the press before a tap's click (about 110 ms on a phone) is spent loading; measured in [PERFORMANCE.md](../../docs/PERFORMANCE.md#shows-warmed-from-its-link-2026-10-05-branch-showsprovider-and-preload). Other paths have nothing to warm. Nothing warms until a pointer, a press or focus reaches a link.
- Routes and screens are listed in the [root README](../../README.md#the-kitchen-larder); why screens load lazily is in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#the-kitchen-larder).

## Connections
- Uses: `../auth/session.tsx`, `../data/useCollection.ts` (rows, and `preloadCollection()` for warming), `../data/local/localStore.ts` (preference helpers, for `navPins`), `../components/` (Brand, ErrorBoundary, ui, theme), every screen in `../features/`, `../features/larder/KitchenContext.tsx`, `../features/larder/timers/TimerHost.tsx`, `../i18n/`.
- Used by: `../main.tsx`.

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
- A warmed page loads its chunk through the same function as its route (`loadShows()` in `warm.ts`), so the two share one download. `ShowsRoute` picks the direct render or `lazy()` once per visit (`useState`): switching between them on a later render would remount the page and lose its state.
- To warm another page, add its path to `WARMERS` in `warm.ts`. Collections `preloadStore()` reads at sign-in need nothing; warming one only holds it open for the cache's linger.
