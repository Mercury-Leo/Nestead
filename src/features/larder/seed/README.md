# seed
Kitchen data written by hand: the demo family's full kitchen, and the offline "web index" that search and import use in every build.

## Files
| File | Responsibility |
| --- | --- |
| `build.ts` | `buildRecipe(spec)`: turns a hand-written `RecipeSpec` into a recipe, parsing ingredients with the app's parser. |
| `recipes.ts` | `SEED_LIBRARY`: the demo family's 9 recipes. |
| `kitchen.ts` | `SEED_HAVE` (34 items), `SEED_PRESETS`, `SEED_CUSTOM_RULES`, `SEED_LIST`, `SEED_OWN`, `listRow()`. |
| `seedKitchen.ts` | `seedDemoKitchen()` and `clearKitchen()`. |
| `webIndex.ts` | `WEB_INDEX` (7 recipes), the `RecipeSearchProvider` interface and `offlineProvider`. |
| `seed.test.ts` | Kitchen logic checked against the seed's own numbers. |

## How it works
- `seedDemoKitchen()` runs only for a family without a diet profile. It writes the profile, `DEFAULT_STAPLES`, have-now items, the recipes oldest first, and the list, mapping seed slugs to new row ids (`seedKitchen.ts`).
- Only `../../../auth/demoSession.tsx` calls it; opening the app with `?reset-kitchen` runs `clearKitchen()` first.
- `offlineProvider.search()` keeps recipes whose title and ingredient names contain every typed word (`webIndex.ts`); `../KitchenContext.tsx` makes it the provider.
- Recipes are written as a person would and parsed, so the seed exercises the real parser (`build.ts`).

## Connections
- Uses: `../../../domain/kitchen/` (parse, calories, list, normalize, pantry), `../setup.ts` (`DEFAULT_STAPLES`), `../../../data/types.ts`.
- Used by: `../../../auth/demoSession.tsx`, `../KitchenContext.tsx` (`webIndex.ts`), and the tests in `../labels.test.ts` and `../add/draft.test.ts`.

## Rules & gotchas
- Not demo-only: `webIndex.ts` and `build.ts` ship in every build through `../KitchenContext.tsx`.
- `../../../i18n/literals.test.ts` skips any path containing `/seed/`; moved out of here, the recipes' English text would fail it.
- `seed.test.ts` asserts the numbers the design shows (pantry fit, list totals); changing seed data changes those expectations.
- A web recipe's id is its slug, and its URL is `https://<site>/recipes/<slug>` (`build.ts`).

## Tests
`seed.test.ts`: the seed pantry, library fit, diet, search, scaling, the shopping list, list sections and things added by hand.
