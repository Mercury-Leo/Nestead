# server/places
Address suggestions for the address form's street field: `GET /api/places?q=…` answers `{ results: AddressSuggestion[], attribution? }`. The service behind it is an `AddressProvider`, so it can be swapped without touching the browser.

## Files
| File | Responsibility |
| --- | --- |
| `types.ts` | `AddressProvider` (the swap point's interface), `AddressQuery`, `AddressSuggestion`, `PlacesProviderError`, `PlacesError`, `PlacesOptions`. |
| `handler.ts` | `createPlacesHandler({ provider })`: checks the query, picks the language (`planQuery()`), times the provider out, maps failures to statuses, sets caching. Knows no service. |
| `provider.ts` | `defaultAddressProvider()`: **the one place that names the service.** Today Photon. |
| `photon.ts` | `photonProvider()`: Photon's request (`photonUrl()`) and its GeoJSON as suggestions (`toSuggestions()`). |
| `index.ts` | The public surface. |
| `places.test.ts` | The handler with a fake provider, Photon against real answers, and guards on the swap point. |

## How it works
- Production: `../../functions/api/places.ts` is the Cloudflare Pages Function at `/api/places`. Development and `vite preview`: `../../vite.config.ts` mounts the same handler. Both take the provider from `defaultAddressProvider()`.
- The browser calls only `/api/places`, through `../../src/features/family/addresses/addressSearch.ts`, and never learns which service answered. Requests from the service come from the server, so family members' addresses and IPs reach it only as the server's query.
- The query must be 3 to 200 characters. Hebrew letters ask for local names (`language: 'he'`), anything else for English. At most 6 suggestions come back.
- A provider gives its data's credit as `attribution`, which the handler passes on and the form shows under the list. Photon's is "© OpenStreetMap contributors", which OpenStreetMap's licence asks for.
- Statuses: `invalid-query` 400, `limit` 429 (the provider throws `PlacesProviderError('limit')`), `places-failed` 502 (anything else it throws), `timeout` 504 (5 s); other methods get 405. Answers are cached by the browser for a day (`private, max-age=86400`), errors not at all.
- Photon (`photon.ts`): komoot's free, keyless public server at `photon.komoot.io`, OpenStreetMap data. Houses and streets only (`layer`), leaning towards Israel (a point at a low zoom) without being limited to it, twice as many asked as shown since duplicates and places with no city are dropped. Every request carries a `user-agent` naming the app, as komoot asks.

## Swapping the service
1. Write `<service>.ts` beside `photon.ts`, returning an `AddressProvider`: `suggest(query, signal)` turns an `AddressQuery` into `AddressSuggestion`s, throws `PlacesProviderError('limit')` when throttled, and sets `attribution` if the data asks for credit. A key, if it needs one, is a server-only variable passed in from `functions/api/places.ts` and `vite.config.ts` (never `VITE_*`).
2. Return it from `defaultAddressProvider()` in `provider.ts`.
3. Add its tests beside Photon's.

Nothing in `src/` changes.

## Connections
- Uses: web standards only (`fetch`, `URL`, `Response`), and Photon's API.
- Used by: `../../functions/api/places.ts`, `../../vite.config.ts`, and, for types only, `../../src/features/family/addresses/`.

## Rules & gotchas
- Only `provider.ts` and the provider's own file name a service. `places.test.ts` fails if `src/` mentions Photon or komoot, or if the handler, types, the Pages Function or `vite.config.ts` name Photon.
- Browser code imports only types from here (`import type`), as with `../search/`.
- Photon refuses `lang=he` with a 400. A Hebrew query sends no language and gets local names, which in Israel are Hebrew.
- Komoot's server is shared and promises no uptime, and asks for fair use; the endpoint is public, like `/api/search`. If it throttles or goes away, the form simply shows no suggestions, and a self-hosted Photon takes the same requests (`photonProvider({ baseUrl })`).
- Only what is typed in the street and city fields is sent. Never the name, apartment or door code (`../../src/features/family/addresses/AddressForm.tsx`, tested there).

## Tests
`places.test.ts`:
- the handler with a fake provider: results and caching, the language, the attribution, query length and method, each failure, the timeout
- Photon's request (layers, language, bias, limit), real Hebrew and English answers turned into suggestions (houses, streets, duplicates, no city), the user agent, throttling and failures
- the swap point guards
