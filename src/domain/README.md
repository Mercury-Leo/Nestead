# domain
Pure TypeScript shared by every layer: the entity types, board ordering, the kitchen's logic and the Shows page's. No React, no storage.

## Files
| File | Responsibility |
| --- | --- |
| `types.ts` | `Base`, `NewRow`, `Member`, `BoardColumn`, `Task`, the recipe, pantry, diet and list types, `Show`, `Address`, and `AiStatus`. |
| `position.ts` (+ `position.test.ts`) | `positionBetween()`, `comparePosition()`, `POSITION_STEP` (1000). |
| `shows.ts` (+ `shows.test.ts`) | `SHOW_STATUSES` (to watch, watching, watched, dropped), `filterShows()` (All leaves dropped shows out; every genre and tag picked; search words in the title, the genres or the tags), `genreCounts()`, the tag rules (`MAX_TAGS` 20, `MAX_TAG_LENGTH` 30, `sameTag()`, `tidyTag()`, `withTag()`, `hasTags()`, `tagCounts()`, `familyTags()`), `lacksGenres()` (added before genres), `sortShows()` (favourites first is one of its sorts), `parseShowView()` (the stored filters, genres and tags included, and sort), `nextStatus()` (cycles the first three; dropped comes back as to watch), `statusPatch()`, `refreshPatch()` with `REFRESHED_FIELDS`, `newShow()`, and paging: `SHOWS_PAGE` (60) and `shownCount()`. |
| `kitchen/catalog.ts` | `CATALOG`: each ingredient's section, diet flags, calories, carbs and unit weights, the water dry grains take up, which lines are cooking water; `catalogItem()`. |
| `kitchen/normalize.ts` | `normalizeText()`, `singularize()`, `canonicalId()`, `exactCatalogId()`, `containsPhrase()`. |
| `kitchen/hebrewNames.ts` (+ `hebrewNames.test.ts`) | `HEBREW_NAMES`: the Hebrew names of catalog items, by id, for matching. |
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
| `addresses/links.ts` | `destination()`, `geoUrl()`, `appleMapsUrl()`, `googleMapsUrl()`, `navigationUrl()`: navigation links from the street and city only, one per kind of device. |
| `addresses/search.ts` | `searchAddresses()`, `foldWords()`, `editDistance()`: fuzzy search over names, streets and cities. |
| `addresses/addresses.test.ts` | Links and search. |
| `kitchen/kitchen.test.ts` | Unit tests across the kitchen modules. |
| `kitchen/parseHebrew.test.ts` | Hebrew amounts and ingredient headings. |

## How it works
- `NewRow<T>` omits `Base`; the store fills `id`, `familyId`, `createdAt` and `updatedAt` (`types.ts`).
- A moved row takes the midpoint of its neighbours, so one move writes one row; ties sort by `createdAt`, then `id` (`position.ts`).
- Free text reaches the catalog through one normaliser, `canonicalId()` (`kitchen/normalize.ts`), used by the parser, pantry fit, diet checks and search.
- Hebrew text matches through `HEBREW_NAMES` (`kitchen/hebrewNames.ts`), indexed after the English names and aliases. `canonicalId()` reads a Hebrew phrase from its first word and English from its last, since Hebrew puts the noun first: "ציר עוף" and "chicken stock" are both stock.
- The parser reads Hebrew amounts as well as English: units ("2 כוסות", "3-4 שיני"), number words ("חצי", "שתי", "שלושת רבעי"), "and a half" ("כוס וחצי"), "one" after the noun ("ביצה אחת"), a singular unit alone as one ("כף רסק" is a tablespoon), and Walla's right-to-left "1/2 1" as 1½ (`kitchen/parse.ts`).
- List planners return a `ListPlan` of creates, updates and removes; `../features/larder/actions.ts` applies it (`kitchen/list.ts`).
- Calories per 100 g spread a recipe's calories, stated or estimated, over what the finished dish weighs: its ingredients, plus the water dry rice, pasta and grains take up beyond the water and stock the recipe lists. Water that boils off is not taken away, so long simmers read low (`kitchen/calories.ts`).
- Peanuts and tree nuts are separate presets. The nut allergy used to cover peanuts, so a profile that has never set peanuts follows its nut allergy; `withPreset()` writes peanuts down with every switch (`kitchen/diet.ts`).
- Shows sort newest added first by default; favourites first puts starred shows (`favorite === true`) ahead, each group newest added first; by release, a show without a date sorts by 1 January of its year, and shows missing the value sorted on go last, ties by title (`shows.ts`). The title order comes from the caller's collator, so it follows the reader's language.
- A show's genres must all be picked to keep it: Action and Comedy is action comedies (`filterShows()`). The search splits into words, and each word must be in the title (anywhere) or start a word of a genre or a tag, a genre in English or by `genreName` (the caller's translation): "sci" and "scifi" find Sci-Fi, "man" never finds Romance. A show without genres matches no genre.
- `genres` absent means never read (a show added before genres); empty means read, with none. A refresh and a new show always write a list, empty when the service named none (`refreshPatch()`), so `lacksGenres()` picks out only shows that still need a read.
- A refresh writes every field in `REFRESHED_FIELDS`, set to `undefined` where the service no longer has one, so the store clears it (genres, a list, are set to `[]` instead); `status`, `watchedAt`, `favorite`, `createdBy`, `imdbId` and `kind` are never in the patch (`refreshPatch()` in `shows.ts`).
- Tags are the family's own, kept as typed and never translated. Spellings that differ only in case are one tag: `withTag()` saves a typed tag in the spelling the family already uses, the tag filter (`hasTags()`) and `tagCounts()` ignore case, and `familyTags()` lists each once, spelled as first met. The search finds a tag as it finds a genre, by the start of one of its words. A refresh never writes `tags`: it is not in `REFRESHED_FIELDS`.
- More in [ARCHITECTURE.md](../../docs/ARCHITECTURE.md#the-kitchen-larder).

## Connections
Imports nothing outside `domain/`. Used by `../data/`, `../auth/`, `../features/board/`, `../features/lists/`, every folder in `../features/larder/`, `../features/activities/shows/` and `../features/family/addresses/`.

## Rules & gotchas
- `types.ts` mirrors `../../supabase/schema.sql`: change both (`types.ts` header).
- `AiStatus` is what `family_ai_status()` returns to any member: the key's last four characters, its model and who added it, and the member's free reads. It never carries the key or its ciphertext. `family_ai_settings` and `ai_usage` have no row type on purpose: no client can read those tables, so no screen should ever hold one of their rows (`types.ts`, `../../supabase/schema.sql`).
- Stored names stay English (sections, catalog names, preset labels); screens translate them by id in `../features/larder/labels.ts` (`kitchen/sections.ts`, `kitchen/diet.ts`).
- A navigation link carries `destination()`, the street and city, and nothing else: an apartment confuses geocoding, and the door code must never leave the app (`addresses/links.ts`).
- Address search folds text itself (`foldWords()`): `kitchen/normalize.ts`'s `normalizeText()` singularises and drops food words, which would mangle names and streets. It searches the name, street and city, never the apartment or door code; on a tie a name match ranks first, then a street match (`addresses/search.ts`).
- `../i18n/literals.test.ts` skips `domain/`, so English here is never flagged as untranslated.
- `shows.ts` takes a title's details as `FetchedDetails`, its own type with the shape of `server/shows`'s `ShowDetails`, since the domain imports nothing outside itself.
- `ListGroup` rows with `builtin` only hold a built-in section's place; rows without `position` sort at 1000, 2000, then 3000 onwards (`kitchen/list.ts`).
- Read presets through `presetOn()` or `activePresets()`, never `presets[id]`, and write them through `withPreset()`: an unset peanut allergy follows the nut allergy (`kitchen/diet.ts`).
- Lines keep the `canonicalId` they were parsed with, so a new catalog item (peanut oil, satay sauce) reaches a saved recipe only once it is edited and saved again (`kitchen/calories.ts` `catalogFor()`).
- A new catalog item needs its Hebrew names in `kitchen/hebrewNames.ts` too, or Hebrew recipes never match it. A name stands for the product itself, not for something with the same diet flags: the item decides what merges on the shopping list and what counts as in the pantry. `hebrewNames.test.ts` fails on an id the catalog lacks and on a name given to two items.

## Tests
`position.test.ts`; `kitchen/kitchen.test.ts` (parser, normaliser, scaling, durations, diet with peanuts apart from tree nuts, calories per serving and per 100 g, list quantities, search tokens); `kitchen/parseHebrew.test.ts` (Hebrew amounts, headings, English unchanged); `kitchen/hebrewNames.test.ts` (each name's item exists and has it alone, real Hebrew lines, a Hebrew recipe's diet check and calories); `kitchen/groupOrder.test.ts`; `shows.test.ts` (each filter alone and together, genres picked and typed in any order, title words with genres, genre word starts but not middles, translated genre names, genre counts, never read told from read with none, the five sorts with missing values last and favourites first, the stored view with junk, tags included; tags picked whatever the case and with genres, tags found in the search by the start of a word, tag counts and the family's tags with case folded, `tidyTag()` and `withTag()`; the status cycle and `watchedAt`, a refresh that updates the fetched fields and keeps `status`, `watchedAt`, the star and the tags, a new show unstarred, whole pages and reaching a show past them). Numbers checked against the seed are in `../features/larder/seed/seed.test.ts`.
