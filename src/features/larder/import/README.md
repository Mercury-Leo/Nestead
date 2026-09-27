# import
Bring in a recipe from a link or from the offline web index (`/import`), check it against pantry and diet, fix it, and save it.

## Files
| File | Responsibility |
| --- | --- |
| `ImportRecipe.tsx` (+ `ImportRecipe.module.css`, also used by `PreviewCard.tsx`) | Paste a link or search online; results and the preview (default export). |
| `PreviewCard.tsx` | The recipe against pantry and diet, fixes for flagged lines, tags; Save, or "Edit before saving". |
| `imported.ts` (+ `imported.test.ts`) | `fromImported()`, `applyFixes()`, `whatWeRead()`, `suggestedTags()`. |

## How it works
- `fetchRecipe()` checks `navigator.onLine`, POSTs `{ url }` to `/api/import`, and turns error codes into messages (`ImportRecipe.tsx`); the server side is [server/import](../../../../server/import/README.md).
- `fromImported()` parses every line with `parseIngredientLine()`, gives ids `imp-i<n>` and `imp-s<n>`, defaults servings to 4, and estimates calories the page left out (`imported.ts`).
- "Search online" is `kitchen.provider.search()`, the bundled offline index (`ImportRecipe.tsx`, `../seed/webIndex.ts`).
- Save calls `saveToLibrary()`; "Edit before saving" goes to `/add` with an `ImportHandoff` in router state (`PreviewCard.tsx`).

## Connections
- Uses: `server/import` (types only), `../add/AddRecipe.tsx` (the `ImportHandoff` type), `../add/draft.ts` (`UNITS`), `../actions.ts`, `../recipe/`, `../labels.ts`, `../KitchenContext.tsx`.
- Used by: `../../../app/AppRoutes.tsx`.

## Rules & gotchas
- Keep imports from `server/import` type-only (`import type`), or server code enters the app bundle.
- `/api/import` exists under `npm run dev` and in production, not under `vite preview` (`../../../../vite.config.ts`).
- An imported recipe's id is `import:<url>` until it is saved (`imported.ts`).

## Tests
`imported.test.ts`, on `tests/fixtures/gnocchi.html`: every line parsed and the handful of basil flagged, the calorie estimate, "What we read", suggested tags, a typed fix applied.
