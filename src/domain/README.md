# domain
Pure TypeScript shared by every layer: the entity types, board ordering, and the kitchen's logic. No React, no storage.

## Files
| File | Responsibility |
| --- | --- |
| `types.ts` | `Base`, `NewRow`, `Member`, `BoardColumn`, `Task`, and the recipe, pantry, diet and list types. |
| `position.ts` (+ `position.test.ts`) | `positionBetween()`, `comparePosition()`, `POSITION_STEP` (1000). |
| `kitchen/catalog.ts` | `CATALOG`: each ingredient's section, diet flags, calories, carbs and unit weights, the water dry grains take up, which lines are cooking water; `catalogItem()`. |
| `kitchen/normalize.ts` | `normalizeText()`, `singularize()`, `canonicalId()`, `exactCatalogId()`, `containsPhrase()`. |
| `kitchen/parse.ts` | `parseIngredientLine()` (English and Hebrew amounts), `parseIngredientBlock()`, `isIngredientHeading()`, `parseNumber()`, `localId()`. |
| `kitchen/quantity.ts` | `scaleQty()`, `formatAmount()`, `formatDuration()`, `formatClock()` and friends. |
| `kitchen/durations.ts` | `detectDurations()`: times in step text, and what to call each timer. |
| `kitchen/calories.ts` | `catalogFor()`, `lineGrams()`, `estimateKcal()`, `netCarbsPerServing()`, `dishGrams()`, `kcalPer100g()`. |
| `kitchen/fit.ts` | `pantryIndex()`, `lineStatus()`, `pantryFit()`: have, staple or missing. |
| `kitchen/pantry.ts` | `pantryRow()`: a pantry row filed under its catalog section. |
| `kitchen/sections.ts` | `SECTION_ORDER` (supermarket walking order) and `groupBySection()`. |
| `kitchen/diet.ts` | `PRESETS`, `presetOn()`, `withPreset()`, `checkDiet()`, `parseCustomRule()`, `dietTags()`. |
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
- Calories per 100 g spread a recipe's calories, stated or estimated, over what the finished dish weighs: its ingredients, plus the water dry rice, pasta and grains take up beyond the water and stock the recipe lists. Water that boils off is not taken away, so long simmers read low (`kitchen/calories.ts`).
- Peanuts and tree nuts are separate presets. The nut allergy used to cover peanuts, so a profile that has never set peanuts follows its nut allergy; `withPreset()` writes peanuts down with every switch (`kitchen/diet.ts`).
- More in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#the-kitchen-larder).

## Connections
Imports nothing outside `domain/`. Used by `../data/`, `../auth/`, `../features/board/`, `../features/lists/` and every folder in `../features/larder/`.

## Rules & gotchas
- `types.ts` mirrors `../../supabase/schema.sql`: change both (`types.ts` header).
- Stored names stay English (sections, catalog names, preset labels); screens translate them by id in `../features/larder/labels.ts` (`kitchen/sections.ts`, `kitchen/diet.ts`).
- `../i18n/literals.test.ts` skips `domain/`, so English here is never flagged as untranslated.
- `ListGroup` rows with `builtin` only hold a built-in section's place; rows without `position` sort at 1000, 2000, then 3000 onwards (`kitchen/list.ts`).
- Read presets through `presetOn()` or `activePresets()`, never `presets[id]`, and write them through `withPreset()`: an unset peanut allergy follows the nut allergy (`kitchen/diet.ts`).
- Lines keep the `canonicalId` they were parsed with, so a new catalog item (peanut oil, satay sauce) reaches a saved recipe only once it is edited and saved again (`kitchen/calories.ts` `catalogFor()`).
- `normalizeText()` keeps Latin letters only, so a Hebrew item name gets no `canonicalId`: no pantry match, diet flag or calorie value until the catalog has Hebrew names. Its amount is still read.

## Tests
`position.test.ts`; `kitchen/kitchen.test.ts` (parser, normaliser, scaling, durations, diet with peanuts apart from tree nuts, calories per serving and per 100 g, list quantities, search tokens); `kitchen/parseHebrew.test.ts` (Hebrew amounts, headings, English unchanged); `kitchen/groupOrder.test.ts`. Numbers checked against the seed are in `../features/larder/seed/seed.test.ts`.
