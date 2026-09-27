# add
Write or edit a recipe (`/add`, `/add?edit=:id`), including a draft handed over by the import screen.

## Files
| File | Responsibility |
| --- | --- |
| `AddRecipe.tsx` (+ `AddRecipe.module.css`, also used by `FormCard.tsx` and `reorder.tsx`) | The form (default export); exports the `ImportHandoff` type. |
| `draft.ts` (+ `draft.test.ts`) | The form's model: `Draft` rows, `fromRecipe()`, `toRecipe()`, `validate()`, `UNITS`. |
| `photo.ts` | `resizePhoto()`: JPEG, PNG or WebP in, a JPEG of at most 1600px at quality 0.85 out. |
| `reorder.tsx` | `move()`, `Handle` (arrow keys) and `useDragList()` (HTML5 drag) for ingredient and step rows. |
| `FormCard.tsx` | `Card` and `ErrorText`, the form's layout pieces. |

## How it works
- The form starts from the recipe being edited, else the import handoff in `location.state.draft`, else empty (`AddRecipe.tsx`).
- `toRecipe()` parses each row with `parseIngredientLine()`, flags unreadable amounts `needsFix`, and estimates calories unless the source stated them (`draft.ts`).
- Save puts a new photo in `store.photos` first, then creates or updates the recipe, then removes a replaced photo (`AddRecipe.tsx`).
- Delete takes the recipe off the shopping list first (`removeRecipeFromList()`), then removes the row and its photo (`AddRecipe.tsx`).
- The ingredient list always ends in one empty row to type into (`setRows()` in `AddRecipe.tsx`).

## Connections
- Uses: `../actions.ts`, `../KitchenContext.tsx`, `../labels.ts`, `../recipe/` (`equipment.ts`, `recipeView.ts`), `../../../domain/kitchen/` (catalog, durations, parse, calories, quantity), `../../../components/`.
- Used by: `../../../app/AppRoutes.tsx`, `../import/PreviewCard.tsx` (`ImportHandoff`, `UNITS`), `../labels.test.ts` (`draft.ts`).

## Rules & gotchas
- On edit, optional fields missing from the new content are sent as `undefined` so they clear (`AddRecipe.tsx`).
- Step titles and ingredient links survive an edit only because `StepRow` carries them; links to removed ingredients are dropped (`draft.ts`).
- `statedKcal` keeps a source's own calories instead of an estimate (`draft.ts`).
- Row dragging uses HTML5 drag events, which `../../board/useTaskDrag.ts` notes do nothing on phones; the handle's arrow keys are the other route (`reorder.tsx`).

## Tests
`draft.test.ts`: required fields, fractions, ranges and notes in rows, a round trip keeping source and stated calories, an estimate for your own recipe.
