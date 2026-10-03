# import
Bring in a recipe from a link or from an online search (`/import`), check it against pantry and diet, fix it, and save it.

## Files
| File | Responsibility |
| --- | --- |
| `ImportRecipe.tsx` (+ `ImportRecipe.module.css`, also used by `PreviewCard.tsx` and `WebResults.tsx`) | Paste a link or search online; results and the preview (default export). |
| `WebResults.tsx` | "Search online" hits: title, site and, where found, a picture; choosing one imports it. |
| `webSearch.ts` (+ `webSearch.test.ts`) | `searchOnline()`: asks `/api/search` and sorts the answer into hits, unavailable or failed. |
| `PreviewCard.tsx` | The recipe against pantry and diet, fixes for flagged lines, tags; Save, or "Edit before saving". |
| `imported.ts` (+ `imported.test.ts`) | `fromImported()`, `applyFixes()`, `whatWeRead()`, `mostlyUnrecognised()`, `suggestedTags()`. |

## How it works
- `fetchRecipe(url)` checks `navigator.onLine`, POSTs `{ url }` to `/api/import`, and turns error codes into messages (`ImportRecipe.tsx`); the server side is [server/import](../../../../server/import/README.md).
- `fromImported()` leaves out headings among the ingredients ("For the sauce:", "תיבול:", `isIngredientHeading()`), parses every other line with `parseIngredientLine()`, gives ids `imp-i<n>` and `imp-s<n>`, defaults servings to 4, and estimates calories the page left out (`imported.ts`).
- "Search online" asks `/api/search` through `searchOnline()`; the server side is [server/search](../../../../server/search/README.md). Hits are pages not yet read: choosing one runs the same `fetchRecipe()` as a pasted link (`ImportRecipe.tsx`, `WebResults.tsx`).
- Where the build has no online search (no endpoint, or no key), the same box searches the bundled index, `kitchen.provider.search()`, under a note that says so (`../seed/webIndex.ts`). Search failures and a used-up monthly allowance get their own messages.
- An answer to an older search is dropped (`searchRun`); choosing a result, online or bundled, scrolls its preview into view (`reveal`, `ImportRecipe.tsx`).
- A recipe whose ingredient lines mostly match nothing in the catalog, as one in a language other than English or Hebrew does, is not vouched for: the preview says it was not checked against the diet in place of "Fits", and no diet tags are suggested (`mostlyUnrecognised()` in `imported.ts`, `PreviewCard.tsx`). A conflict the check does find is still shown.
- Save calls `saveToLibrary()`; "Edit before saving" goes to `/add` with an `ImportHandoff` in router state (`PreviewCard.tsx`).
- The preview shows what needs checking and folds the rest: the fit as a bar and a to-buy count, "What we read" as ticked counts with each problem on its own line (`whatWeRead()` lists the counts first, then the problems), and the steps behind a toggle (`PreviewCard.tsx`). Results are compact `RecipeRow`s whose title and thumbnail choose the recipe.

## Connections
- Uses: `server/import` and `server/search` (types only), `../add/AddRecipe.tsx` (the `ImportHandoff` type), `../add/draft.ts` (`UNITS`), `../actions.ts`, `../recipe/`, `../labels.ts`, `../KitchenContext.tsx`.
- Used by: `../../../app/AppRoutes.tsx`.

## Rules & gotchas
- Keep imports from `server/import` and `server/search` type-only (`import type`), or server code enters the app bundle.
- `/api/import` and `/api/search` exist under `npm run dev`, `vite preview` and in production (`../../../../vite.config.ts`); search needs `TAVILY_API_KEY`, and without it falls back to the bundled index.
- An imported recipe's id is `import:<url>` until it is saved; a recipe without a URL (pasted text read by AI) gets the id `import:text` and the source `{ kind: 'mine' }` (`imported.ts`).
- `whatWeRead()` puts 'Read by AI' first when `stated.ai` is set, so the person checks it against the original before saving.

## Tests
`imported.test.ts`, on `tests/fixtures/gnocchi.html`: every line parsed and the handful of basil flagged, the calorie estimate, "What we read" (counts, then what to check), suggested tags, a typed fix applied; an Arabic recipe told apart as unrecognised, with no diet tags, and the same recipe in Hebrew read and tagged; 10dakot's shakshuka with its amounts, items and headings. `webSearch.test.ts`: hits, unavailable (no endpoint, no key), a used-up allowance and other failures.
