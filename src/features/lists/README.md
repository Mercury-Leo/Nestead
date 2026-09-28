# lists
The family's shopping list (`/lists`), for everything, not only food: Supermarket (recipe groceries, by aisle), General, and sections the family adds, in an order the family can drag.

## Files
| File | Responsibility |
| --- | --- |
| `ShoppingList.tsx` (+ `ShoppingList.module.css`, shared by every file here) | The page: sections, progress, checked actions, recipes on the list, and what was left off the list. |
| `ListRows.tsx` | `ItemRow`, `AddItem` (commas add several) and the `Group` shape. |
| `ItemForm.tsx` | Sheet to rename an item, add a note, move it to another section or remove it. |
| `GroupForm.tsx` | Sheet to add, rename or delete a section the family made. |
| `useSectionDrag.ts` | Pointer dragging of sections by their grip; Escape cancels. |
| `useJustAdded.ts` | Router handoff from a recipe's "Make shopping list": lights up the added items for 2 s. |
| `format.ts` | `forLine()`: "for Shakshuka and Lemon Chicken". |

## How it works
- Rows come from `useKitchen()` (`listItems`, `listGroups`); writes go through `../larder/actions.ts` (`ShoppingList.tsx`).
- Order is `orderGroups()`; a drag or the grip's arrow keys call `placeListGroup()`, which creates a `builtin` row the first time Supermarket or General moves (`ShoppingList.tsx`, `../larder/actions.ts`).
- Typed items go through `addOwnToList()`; recipe items arrive from `addRecipeToList()` on the recipe page (`../larder/actions.ts`).
- "Move to pantry" takes only checked groceries (`isGrocery()`); "Clear checked" removes everything checked (`ShoppingList.tsx`).
- Folded sections are a per-family device preference, `listCollapsed` (`ShoppingList.tsx`).
- "Left off this list" folds like a section: a count, and the pantry and staple names when opened. It starts folded and is not remembered. There is no page subtitle: the progress bar counts the items ("2/8") and the recipes card lists the recipes, each with its item count (`ShoppingList.tsx`).
- Product rules: [LARDER.md](../../../docs/LARDER.md#where-it-differs-from-the-larder-brief).

## Connections
- Uses: `../larder/` (`actions.ts`, `KitchenContext.tsx`, `labels.ts`, `recipe/`), `../../domain/kitchen/` (`list.ts`, `sections.ts`, `fit.ts`, `catalog.ts`, `normalize.ts`), `../../hooks/pointerDrag.ts`, `../board/dragDrop.ts`, `../../data/local/localStore.ts`.
- Used by: `../../app/AppRoutes.tsx`, `../larder/detail/RecipeDetail.tsx` (the `ListHandoff` type).

## Rules & gotchas
- Deleting a section moves its items to General first (`removeListGroup()` in `../larder/actions.ts`); an item whose section vanished elsewhere shows in General (`placeOf()` in `ShoppingList.tsx`).
- `builtin` rows only hold a place: they are never renamed or deleted, and `GroupForm` never receives one (`ShoppingList.tsx`).
- Renaming an item looks up its catalog id and aisle again: loosely in Supermarket, by exact name elsewhere (`ItemForm.tsx`).
- `useSectionDrag.ts` borrows `insertionBefore()` from `../board/dragDrop.ts`; a change there affects both drags.

## Tests
None here. The planning logic is tested in `../../domain/kitchen/` and `../larder/seed/seed.test.ts`.
