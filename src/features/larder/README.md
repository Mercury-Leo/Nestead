# larder
The family kitchen: state and writes shared by the kitchen screens, one folder per screen, and the pieces they share.

## Files
| File | Responsibility |
| --- | --- |
| `KitchenContext.tsx` | `KitchenProvider` and `useKitchen()`: recipes, have-now, staples, pantry index, profile, list items and sections, read once; `findRecipe()`. |
| `actions.ts` | Writes that span collections: recipes on and off the list, typed items, sections, save to library, pantry adds, move to pantry. |
| `setup.ts` | `ensureKitchen()`: a new family's empty diet profile and `DEFAULT_STAPLES`. Never throws. |
| `labels.ts` (+ `labels.test.ts`) | Translated words for the domain's fixed ids: sections, presets, units, amounts, timers, diet warnings. |
| `hints.ts` (+ `hints.test.ts`) | `useHint()` and `markHintUsed()`: helper copy that shows until its action has been done once on this device. |

Screens with their own README: [add/](add/README.md), [cook/](cook/README.md), [import/](import/README.md), [pantry/](pantry/README.md), [search/](search/README.md). Shared: [recipe/](recipe/README.md), [seed/](seed/README.md), [timers/](timers/README.md). One-file screens are below.

## How it works
- `../../app/App.tsx` mounts `KitchenProvider` once; `loaded` is true only when all five collections have been read (`KitchenContext.tsx`).
- `profile` is the oldest diet-profile row, in case two devices raced to create one (`KitchenContext.tsx`).
- `findRecipe()` finds library rows (marked `inLibrary`) and offline web recipes from `seed/webIndex.ts` (`KitchenContext.tsx`).
- Screens decide what to do; `actions.ts` writes it, applying the plans from `../../domain/kitchen/list.ts`.
- Learn-once copy (the timers line, cook mode's key and swipe lines, pantry's swipe and Enter lines) reads `useHint()`; the screen that sees the action calls `markHintUsed()`, and the list lives at `nestead:device:pref:hintsUsed` (`hints.ts`).
- Screen map and design decisions: [LARDER.md](../../../docs/LARDER.md); data: [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md#the-kitchen-larder).

## Connections
- Uses: `../../auth/session.tsx`, `../../data/useCollection.ts`, `../../domain/kitchen/`, `../../i18n/`.
- Used by: `../../app/` (App, routes, nav), `../../auth/supabaseSession.tsx` (`ensureKitchen`), `../lists/`.

## Rules & gotchas
- `seed/webIndex.ts` ships in every build, because `KitchenContext.tsx` imports `offlineProvider`; only the demo seed is left out of Supabase builds (`../../auth/session.tsx`).
- Stored names stay English (sections, staples); show them through `labels.ts`.
- Hints are device state: read and write them through `hints.ts`, which uses the device preference helpers, never the `DataStore`.
- Screens share through `recipe/` or this folder, with two exceptions: `import/PreviewCard.tsx` imports the `ImportHandoff` type from `add/AddRecipe.tsx` and `UNITS` from `add/draft.ts`.

## Tests
`labels.test.ts`: the English wording matches the domain's for every seed recipe and profile, and Hebrew says numbers and plurals correctly. `hints.test.ts`: a used hint is stored once, and a stored value that is not a list starts over.

## Single-file screens
| Folder | Route | What it does |
| --- | --- | --- |
| `detail/` (`RecipeDetail.tsx` + css) | `/recipe/:id` | Time, calories and what to buy on one line, with prep/cook, per-serving, estimate and "You have 6/9" behind a toggle; servings via `useServings()`, have/staple/to-buy per ingredient, steps; "Make shopping list" hands the added ids to `/lists`; web recipes can be saved; library recipes take a family rating. The timers footnote shows until a timer has been started (`hints.ts`). |
| `library/` (`Library.tsx` + css) | `/library` | Library recipes with local search, source filter with counts (all, mine, web) and five sorts; a one-line banner counts recipes that need nothing from the shop; links to `/add` and `/import`. No subtitle: the filter carries the counts. |
| `profile/` (`DietProfile.tsx` + css) | `/profile` | Toggles `PRESETS`, adds rules via `parseCustomRule()`, sets hide or warn (the warn option shows a sample badge rather than describing one); creates the profile row if missing. The subtitle is the one line on scope: shared by the family, applied everywhere. |
