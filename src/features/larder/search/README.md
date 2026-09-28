# search
Recipe search (`/search`): by ingredients or by name, across the library and the web index, ranked by pantry fit, filtered and checked against the diet profile.

## Files
| File | Responsibility |
| --- | --- |
| `Search.tsx` (+ `Search.module.css`, also used by `FilterControls.tsx` and `TokenBox.tsx`) | The page: query box, pantry switch, results with the sort beside them, the hidden-by-diet note, "loosen a filter" suggestions. |
| `FilterControls.tsx` | Every filter except the sort; the desktop panel and the phone sheet lay the same controls out differently. |
| `TokenBox.tsx` | `TokenBox` (ingredients become removable tokens) and `NameBox` (by recipe name). |
| `filterLabels.ts` | Translated words for active filters, suggestions and the calorie range. |

## How it works
- Query state is local to the page: `?q=a,b` prefills tokens, and `?pantry=1` or any `q` turns on "Cook from my pantry" (`Search.tsx`).
- Results are `search(query, filters, ctx)` over `kitchen.recipes` and `kitchen.web`; a web recipe already saved to the library shows once, as the library copy (`../../../domain/kitchen/search.ts`).
- An ingredient search keeps recipes that match two thirds of the tokens (`tokensNeeded()`); "lemon" never matches lemongrass (`lineMatchesToken()`).
- Diet conflicts are hidden or flagged by `conflictMode`, which follows the profile until the person picks (`Search.tsx`).
- With no results, `suggestions()` offers only loosenings that would find something (`../../../domain/kitchen/search.ts`).
- On a phone, filters are edited as a draft in the sheet and applied together (`draft` in `Search.tsx`).
- The sort is one select beside the results (desktop) or in the bar above them (phone), never also in the filters. The hidden-by-diet note gives the count and the reasons; the titles appear with Show anyway. With no results the page offers the loosenings, or Add recipe when there are none (`Search.tsx`).
- The desktop panel counts the diet rules (the sidebar lists them); the phone sheet shows them as chips (`FilterControls.tsx`).

## Connections
- Uses: `../../../domain/kitchen/search.ts`, `../KitchenContext.tsx`, `../labels.ts`, `../recipe/` (`RecipeCard.tsx`, `recipeView.ts`), `../../../components/`, `../../../hooks/useMediaQuery.ts`, `../../../i18n/`.
- Used by: `../../../app/AppRoutes.tsx`.

## Rules & gotchas
- The domain's English labels (`SORT_LABELS`, `ActiveFilter.label`) serve its tests; screens word filters through `filterLabels.ts` and `../labels.ts`.
- Nothing is saved: leaving the page resets the query and filters (`Search.tsx` keeps them in `useState`).

## Tests
None here. `search()` and `suggestions()` are tested on the seed in `../seed/seed.test.ts`, tokens in `../../../domain/kitchen/kitchen.test.ts`.
