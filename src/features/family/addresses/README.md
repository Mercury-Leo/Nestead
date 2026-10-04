# addresses
The family's address book (`/addresses`), the Family section's second page: saved places with an optional apartment and door code, a fuzzy search, and directions through the device's own navigation.

## Files
| File | Responsibility |
| --- | --- |
| `AddressesPage.tsx` | The page: the search bar, the list sorted by name or by match, each row's actions, the add and edit `Sheet`, and the delete confirmation `Sheet`. |
| `AddressForm.tsx` | Add or edit: name, street and number, city (required, with inline errors), apartment and door code (optional). |
| `NavigateButton.tsx` | `NavigateButton`, one link to the device's own navigation, and `navigationPlatform()`, which picks it. |
| `actions.ts` | `saveAddress()`, `removeAddress()`, and the form's `AddressFields`. |
| `Addresses.module.css` | Rows, the toolbar, the Navigate link, the form. |
| `AddressesPage.test.tsx` | The page in jsdom, with a local store. |

## How it works
- Rows come from `useCollectionState(store.addresses)`. The page shows Loading until the first read, then the empty state, or the search bar and list. The route does not wait for the kitchen (`../../../app/AppRoutes.tsx`).
- Search runs on the device through `searchAddresses()` (`../../../domain/addresses/search.ts`), on every keystroke and with no debounce. It matches the name, street and city, forgives typos, partial words, accents and niqqud, and ranks better matches first. The query lives in state, not a preference, so every visit starts empty. Escape or the clear button empties it. The search bar is hidden while there are no addresses.
- Navigate is one link, chosen by device (`navigationPlatform()`, `../../../domain/addresses/links.ts`):
  - On Android it is a `geo:` link, in the same tab, and the system asks which navigation app to use (Waze, Google Maps, …). If the person has set a default app, that app opens without asking.
  - iOS has no chooser and no `geo:` scheme, so iPhones and iPads get Apple Maps directions, in a new tab. An iPad asking for desktop pages calls itself a Mac and is told apart by its touch screen.
  - Anything else gets Google Maps directions in a new tab.
- The device is read from the user agent, not the width: the choice is how a link is handed to the operating system, and a narrow desktop window has no app chooser.
- Saving trims every field. A blank optional field is saved as undefined, which also clears it on an edit (`actions.ts`).
- Names, streets and codes are wrapped in `<bdi>`, not given `dir="auto"`: each piece gets its own direction, but stays on the page's side, so a Hebrew address in the English UI lines up with its apartment and door code.

## Connections
- Uses: `../../../auth/session.tsx`, `../../../data/useCollection.ts`, `../../../domain/addresses/`, `../../../components/` (PageHeader, ui), `../../../i18n/`.
- Used by: `../../../app/AppRoutes.tsx` (lazy), `../../../app/sections.ts` (Family's second page).

## Rules & gotchas
- The door code stays on the row. Never put it in a URL, a log, a page title or the search: links come only from `destination()` (street and city), and `AddressesPage.test.tsx` checks that no link on the page carries it.
- The Android `geo:` link has no `target`: the system takes it over, and a new tab would be left open and blank (`NavigateButton.tsx`).
- Address text comes from people, so it renders as React text through `t()` values or children, never through `<Trans>` values (`../../../i18n/README.md`).
- On Supabase the table needs `../../../../supabase/migrations/20261004120000_addresses.sql` applied first. Until then the page's reads fail.

## Tests
`AddressesPage.test.tsx` (jsdom, local store):
- an empty book has no search bar, and an empty save shows the three errors and writes nothing
- a typo, a prefix and a city find the right rows, the street before the city; Escape and the clear button empty the search
- Navigate on Android (a `geo:` link, same tab, no door code in any link), an iPhone and an iPad that calls itself a Mac (Apple Maps), and a computer (Google Maps)
- delete asks first
- an edit clears a blanked optional field

Links and search themselves are tested in `../../../domain/addresses/addresses.test.ts`.
