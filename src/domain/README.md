# domain
Pure TypeScript shared by every layer: the entity types, board ordering, and the kitchen's logic. No React, no storage.

## Files
| File | Responsibility |
| --- | --- |
| `types.ts` | `Base`, `NewRow`, `Member`, `BoardColumn`, `Task`, and the recipe, pantry, diet and list types. |
| `position.ts` (+ `position.test.ts`) | `positionBetween()`, `comparePosition()`, `POSITION_STEP` (1000). |
| `kitchen/catalog.ts` | `CATALOG`: each ingredient's section, diet flags, calories, carbs and unit weights; `catalogItem()`. |
| `kitchen/normalize.ts` | `normalizeText()`, `singularize()`, `canonicalId()`, `exactCatalogId()`, `containsPhrase()`. |
| `kitchen/parse.ts` | `parseIngredientLine()` (English and Hebrew amounts), `parseIngredientBlock()`, `isIngredientHeading()`, `parseNumber()`, `localId()`. |
| `kitchen/quantity.ts` | `scaleQty()`, `formatAmount()`, `formatDuration()`, `formatClock()` and friends. |
| `kitchen/durations.ts` | `detectDurations()`: times in step text, and what to call each timer. |
| `kitchen/calories.ts` | `catalogFor()`, `lineGrams()`, `estimateKcal()`, `netCarbsPerServing()`. |
| `kitchen/fit.ts` | `pantryIndex()`, `lineStatus()`, `pantryFit()`: have, staple or missing. |
| `kitchen/pantry.ts` | `pantryRow()`: a pantry row filed under its catalog section. |
| `kitchen/sections.ts` | `SECTION_ORDER` (supermarket walking order) and `groupBySection()`. |
| `kitchen/diet.ts` | `PRESETS`, `checkDiet()`, `parseCustomRule()`, `dietTags()`. |
| `kitchen/list.ts` (+ `groupOrder.test.ts`) | Shopping-list plans (`planAddRecipe`, `planRemoveRecipe`, `planAddOwn`, `planRemoveGroup`) and section order (`orderGroups`, `groupDropPosition`). |
| `kitchen/search.ts` | `search()`, `suggestions()`, `activeFilters()`, `defaultFilters()`. |
| `kitchen/kitchen.test.ts` | Unit tests across the kitchen modules. |
| `kitchen/parseHebrew.test.ts` | Hebrew amounts and ingredient headings. |

## How it works
- `NewRow<T>` omits `Base`; the store fills `id`, `familyId`, `createdAt` and `updatedAt` (`types.ts`).
- A moved row takes the midpoint of its neighbours, so one move writes one row; ties sort by `createdAt`, then `id` (`position.ts`).
- Free text reaches the catalog through one normaliser, `canonicalId()` (`kitchen/normalize.ts`), used by the parser, pantry fit, diet checks and search.
- The parser reads Hebrew amounts as well as English: units ("2 כוסות", "3-4 שיני"), number words ("חצי", "שתי", "שלושת רבעי"), "and a half" ("כוס וחצי"), "one" after the noun ("ביצה אחת"), a singular unit alone as one ("כף רסק" is a tablespoon), and Walla's right-to-left "1/2 1" as 1½ (`kitchen/parse.ts`).
- List planners return a `ListPlan` of creates, updates and removes; `../features/larder/actions.ts` applies it (`kitchen/list.ts`).
- More in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#the-kitchen-larder).

## Connections
Imports nothing outside `domain/`. Used by `../data/`, `../auth/`, `../features/board/`, `../features/lists/` and every folder in `../features/larder/`.

## Rules & gotchas
- `types.ts` mirrors `../../supabase/schema.sql`: change both (`types.ts` header).
- Stored names stay English (sections, catalog names, preset labels); screens translate them by id in `../features/larder/labels.ts` (`kitchen/sections.ts`, `kitchen/diet.ts`).
- `../i18n/literals.test.ts` skips `domain/`, so English here is never flagged as untranslated.
- `ListGroup` rows with `builtin` only hold a built-in section's place; rows without `position` sort at 1000, 2000, then 3000 onwards (`kitchen/list.ts`).
- `normalizeText()` keeps Latin letters only, so a Hebrew item name gets no `canonicalId`: no pantry match, diet flag or calorie value until the catalog has Hebrew names. Its amount is still read.

## Tests
`position.test.ts`; `kitchen/kitchen.test.ts` (parser, normaliser, scaling, durations, diet, calories, list quantities, search tokens); `kitchen/parseHebrew.test.ts` (Hebrew amounts, headings, English unchanged); `kitchen/groupOrder.test.ts`. Numbers checked against the seed are in `../features/larder/seed/seed.test.ts`.
