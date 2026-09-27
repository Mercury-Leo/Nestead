# recipe
Recipe presentation shared by the kitchen screens and the shopping list: cards, photos, stars, badges, markers, step text and the view model.

## Files
| File | Responsibility |
| --- | --- |
| `RecipeCard.tsx` (+ `RecipeCard.module.css`) | `RecipeCard` (grid card), `RecipeRow` (list row), `RecipeGrid`, `RecipeList`. |
| `RecipePhoto.tsx` | The stored photo via `store.photos.url()`, else `photoUrl`, else the placeholder. |
| `PhotoPlaceholder.tsx` (+ `PhotoPlaceholder.module.css`) | A linen tile with a plate, for recipes without a photo. |
| `Rating.tsx` (+ `Rating.module.css`) | `Stars` (read-only, halves) and `RatingInput` (tap 1 to 5). |
| `MatchBlock.tsx` (+ `MatchBlock.module.css`) | `MatchBar` and `MatchBlock`: what you have against what to buy. |
| `StatusMarker.tsx` (+ `StatusMarker.module.css`) | The have, staple or to-buy marker beside an ingredient. |
| `badges.tsx` (+ `badges.module.css`) | `SourceBadge`, `WarningBadge`, `BuyPill`, `EstTag`. |
| `StepText.tsx` | Step text with detected times swapped for chips; `chipKey()`. |
| `recipeView.ts` | `recipeView()` works out fit, diet, rating, total time, kcal and to-buy once; `recipePath()`, `siteOf()`. |
| `servings.ts` | `useServings()`, `servingsFor()`, `scaledAmount()`. |
| `equipment.ts` | `equipmentIcon()`: an icon from what the equipment's name mentions. |

## How it works
- Screens build `RecipeView`s with `recipeView(recipe, pantry, profile)`; search passes its own `fit` and `diet` so they are not worked out twice (`recipeView.ts`, `../search/Search.tsx`).
- `recipePath()` URL-encodes the id, because web ids contain a colon (`recipeView.ts`).
- Chosen servings live in a module-level map for the page's lifetime, so cook mode follows the detail page and a reload starts over (`servings.ts`).
- `StepText` renders each time through a callback: a quiet label on the detail page, a timer chip in cook mode (`StepText.tsx`).

## Connections
- Uses: `../../../components/ui` (`MatchBlock.tsx`, `PhotoPlaceholder.tsx` and `badges.tsx` import `ui/cx` directly), `../../../domain/kitchen/` (diet, fit, search, quantity, durations), `../labels.ts`, `../../../auth/session.tsx` (`RecipePhoto.tsx`), `../../../i18n/`.
- Used by: `../add/`, `../cook/`, `../detail/`, `../import/`, `../library/`, `../pantry/`, `../profile/`, `../search/`, `../../lists/ShoppingList.tsx`.

## Rules & gotchas
- Recipe-specific UI belongs here, not in `components/ui/` (`../../../components/ui/index.ts`).
- `chipKey()` is the step index plus the time's character offset in the text; running timers are found by it (`StepText.tsx`, `../timers/store.ts`).
- The rating shown is the family's `userRating` if set, else `sourceRating` (`displayRating()` in `../../../domain/kitchen/search.ts`).
