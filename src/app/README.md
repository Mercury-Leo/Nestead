# app
The signed-in app's frame: the shell around every screen, the sidebar and tab bar, and the route table.

## Files
| File | Responsibility |
| --- | --- |
| `App.tsx` | Wraps `Shell` in `KitchenProvider`, so kitchen rows are read once for every screen and the nav. |
| `Shell.tsx` (+ `Shell.module.css`, also used by `Nav.tsx`) | Sidebar or tab bar, the routed page inside `ErrorBoundary`, and `TimerHost`. |
| `Nav.tsx` | `Sidebar` and `TabBar` from one `useNavItems()` list, with counts and the diet-rules card. |
| `AppRoutes.tsx` | Every route; kitchen screens and `FamilyPage` load as `lazy()` chunks. |

## How it works
- `main.tsx` renders `LocaleProvider` → `ThemeProvider` → `BrowserRouter` → `SessionProvider` → `App`, so nothing here renders before a session exists.
- `AppRoutes.tsx` wraps kitchen routes in `page()`, which shows Loading until `useKitchen().loaded`; `/` (the board) and `/family` do not wait. Unknown paths redirect to `/`.
- `Shell.tsx` drops the sidebar in cook mode (`/^\/recipe\/[^/]+\/cook/`) and the tab bar on every `/recipe/` path; `ErrorBoundary` resets when `pathname` changes.
- `Nav.tsx` counts open tasks, unchecked list items, recipes and have-now items; `isActive()` lights Library for `/library`, `/recipe`, `/add` and `/import`.
- Routes and screens are listed in the [root README](../../README.md#the-kitchen-larder); why screens load lazily is in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#the-kitchen-larder).

## Connections
- Uses: `../auth/session.tsx`, `../data/useCollection.ts`, `../components/` (Brand, ErrorBoundary, ui, theme), every screen in `../features/`, `../features/larder/KitchenContext.tsx`, `../features/larder/timers/TimerHost.tsx`, `../i18n/`.
- Used by: `../main.tsx`.

## Rules & gotchas
- A new kitchen route must go through `page()`, or it renders before the first read and flashes an empty state (`AppRoutes.tsx`).
- `lazy()` needs a default export: named exports are wrapped with `.then((m) => ({ default: m.X }))`; `CookMode`, `AddRecipe` and `ImportRecipe` are default exports (`AppRoutes.tsx`).
- The six nav items and their order live in `useNavItems()`; the item with `larder: true` starts the "Larder" group (`Nav.tsx`).
