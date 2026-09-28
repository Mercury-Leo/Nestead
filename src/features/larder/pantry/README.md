# pantry
The pantry (`/pantry`): what the family has now, and the staples assumed always present.

## Files
| File | Responsibility |
| --- | --- |
| `Pantry.tsx` (+ `Pantry.module.css`, also used by the files below) | Have-now by store section, staples, quick adds, "needed for" hints. |
| `PantryAdd.tsx` | Typeahead over the catalog (`suggest()`, `pantryKeys()`); Enter adds the first match, commas add several. |
| `BulkAdd.tsx` | Sheet for pasting a whole list; strips bullets and numbers, skips what is already there. |
| `SwipeRow.tsx` | A row swiped towards its start to reveal Remove; the × button does the same. |

## How it works
- Have-now and staples are one `pantry` collection split by `kind` (`../KitchenContext.tsx`).
- Every add goes through `addToPantry()`, which capitalises the name, files it under its catalog section (`pantryRow()`) and skips duplicates by `keyForText()` (`../actions.ts`).
- Have-now is grouped by `groupBySection()` in supermarket order (`Pantry.tsx`).
- "Needed for" hints come from list items first, then the five recipes closest to cookable (`Pantry.tsx`).
- The Enter-and-commas line under the suggestions shows until something has been added with Enter, and the phone's swipe line until a row has been swiped open (`pantryAdd`, `pantrySwipe` in `../hints.ts`). The card headings carry bare counts; no subtitle.

## Connections
- Uses: `../actions.ts`, `../hints.ts`, `../KitchenContext.tsx`, `../labels.ts`, `../recipe/StatusMarker.tsx`, `../../../domain/kitchen/` (catalog, fit, normalize, pantry, sections), `../../../hooks/`, `../../../components/`.
- Used by: `../../../app/AppRoutes.tsx`.

## Rules & gotchas
- `QUICK_ADD` names stay English: they become rows matched against the English catalog (`Pantry.tsx`).
- `SwipeRow` ignores mouse pointers and follows reading direction, so the swipe flips in RTL (`SwipeRow.tsx`).
