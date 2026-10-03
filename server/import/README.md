# server/import
Recipe import: fetch a web page and read the recipe from its schema.org data. One dependency-free `(Request) => Promise<Response>` handler.

## Files
| File | Responsibility |
| --- | --- |
| `index.ts` | The public surface: re-exports the handler, guard, parser and types. |
| `handler.ts` | `createImportHandler(options)` and `handleImport`: GET `?url=` or POST `{ url }`, JSON out. |
| `guard.ts` | The SSRF guard: `checkUrl()` and `isPrivateAddress()`. |
| `fetchPage.ts` | `fetchPage()`: follows up to 5 redirects by hand, re-checking each; time and size caps. |
| `parse.ts` | `parseRecipeHtml()`: JSON-LD first, microdata as fallback; `isoMinutes()`, `detectEquipment()`, `decodeEntities()`. |
| `types.ts` | `ImportedRecipe`, `ImportReport`, `ImportError`, `ImportOptions`. |
| `import.test.ts` | Parser, guard and handler cases. |

## How it works
- Production: `../../functions/api/import.ts` exports `onRequest`, which calls `handleImport`, as the Cloudflare Pages Function at `/api/import`.
- Development and `vite preview`: `../../vite.config.ts` mounts `createImportHandler({ resolveHost })` at `/api/import`, with Node DNS so names that resolve to private addresses are refused too.
- "Search online" hits are imported through here too: `../search/` finds the pages, this reads the one chosen.
- `fetchPage()` and `siteOf()` are exported for `../ai/`, which reads pages the same way. `ImportedRecipe.url` and `.site` are absent for pasted text.
- Limits: 10 s and 5 MB (`handler.ts`); http(s) only, no credentials in the URL, no `localhost`, `.local` or `.internal`, no private, loopback or link-local addresses (`guard.ts`).
- Error codes map to statuses: `invalid-url` and `blocked` 400, `fetch-failed` 502, `too-large` 413, `not-found` 422, `timeout` 504; other methods get 405 (`handler.ts`).
- Ingredient lines come back as text; the app parses them with `src/domain/kitchen/parse.ts` (`src/features/larder/import/imported.ts`).
- A list packed into one entry, as older mako.co.il recipes give it, is split at its breaks: the ingredients when there is a single entry (`ingredientLines()`), a step that holds `<br>`s into steps without their numbers (`instructions()`, `parse.ts`).

## Connections
- Uses: nothing but web standards (`fetch`, `URL`, `Response`).
- Used by: `../../functions/api/import.ts`, `../../vite.config.ts`, and, for types only, `../../src/features/larder/import/`.
- Sibling: `../search/` lists only sites whose pages this reads; re-check them with it when adding one.

## Rules & gotchas
- The browser code imports only types from here (`import type` in `ImportRecipe.tsx` and `imported.ts`); a value import would put server code in the app bundle.
- The Pages Function has no DNS API, so there `checkUrl()` judges the URL alone (`../../functions/api/import.ts`).
- `vite.config.ts` mounts the handler in both `configureServer` and `configurePreviewServer`, so `/api/import` works under `npm run dev` and `vite preview` alike.
- `tsconfig.json` includes `server/` and `functions/`, so `npm run build` type-checks them.
- A recipe's serving unit is its yield's word (`slices?|pieces?|cookies?|muffins?|bars?|squares?` in `parse.ts`), kept singular and in English. The app translates exactly these words (`SERVING_WORDS` in `../../src/features/larder/labels.ts`, `kitchen.servingUnit` in the locale files), so add a new one there too, or Hebrew readers see it in English; `labels.test.ts` imports through this parser to check them.

## Tests
`import.test.ts`, with `../../tests/fixtures/gnocchi.html`: JSON-LD in an `@graph`, an ingredient list and a method packed into one entry (Mako's shape), microdata fallback, no recipe, ISO durations and equipment, the SSRF guard including DNS, redirects re-checked, the size cap, the timeout.
