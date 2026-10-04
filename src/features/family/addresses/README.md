# addresses
The family's address book (`/addresses`), the Family section's second page: saved places with an optional apartment and door code, a fuzzy search, and directions through Waze or Google Maps.

## Files
| File | Responsibility |
| --- | --- |
| `AddressesPage.tsx` | The page: the search bar, the list sorted by name or by match, each row's actions, the add and edit `Sheet`, and the delete confirmation `Sheet`. |
| `AddressForm.tsx` | Add or edit: name, street and number, city (required, with inline errors), apartment and door code (optional). |
| `NavigateButton.tsx` | On a phone, a button opening a `Sheet` with Waze and Google Maps links; on desktop, one Google Maps link. |
| `actions.ts` | `saveAddress()`, `removeAddress()`, and the form's `AddressFields`. |
| `Addresses.module.css` | Rows, the toolbar, the Navigate sheet, the form. |
| `AddressesPage.test.tsx` | The page in jsdom, with a local store. |

## How it works
- Rows come from `useCollectionState(store.addresses)`. The page shows Loading until the first read, then the empty state, or the search bar and list. The route does not wait for the kitchen (`../../../app/AppRoutes.tsx`).
- Search runs on the device through `searchAddresses()` (`../../../domain/addresses/search.ts`), on every keystroke and with no debounce. It matches the name and street only, forgives typos, partial words, accents and niqqud, and ranks better matches first. The query lives in state, not a preference, so every visit starts empty. Escape or the clear button empties it. The search bar is hidden while there are no addresses.
- Phone or desktop is `useIsDesktop()`, the breakpoint where the tab bar gives way to the sidebar. It is never the user agent (`NavigateButton.tsx`, `../../../hooks/useMediaQuery.ts`).
- Navigation links are plain `<a target="_blank" rel="noopener noreferrer">` to Waze's and Google Maps' universal links. A phone opens the installed app, or the site if the app is missing (`../../../domain/addresses/links.ts`).
- Saving trims every field. A blank optional field is saved as undefined, which also clears it on an edit (`actions.ts`).
- Names, streets and codes are wrapped in `<bdi>`, not given `dir="auto"`: each piece gets its own direction, but stays on the page's side, so a Hebrew address in the English UI lines up with its apartment and door code.

## Connections
- Uses: `../../../auth/session.tsx`, `../../../data/useCollection.ts`, `../../../domain/addresses/`, `../../../components/` (PageHeader, ui), `../../../hooks/useMediaQuery.ts`, `../../../i18n/`.
- Used by: `../../../app/AppRoutes.tsx` (lazy), `../../../app/sections.ts` (Family's second page).

## Rules & gotchas
- The door code stays on the row. Never put it in a URL, a log, a page title or the search: links come only from `destination()` (street and city), and `AddressesPage.test.tsx` checks that no link on the page carries it.
- Address text comes from people, so it renders as React text through `t()` values or children, never through `<Trans>` values (`../../../i18n/README.md`).
- On Supabase the table needs `../../../../supabase/migrations/20261004120000_addresses.sql` applied first. Until then the page's reads fail.

## Tests
`AddressesPage.test.tsx` (jsdom, local store):
- an empty book has no search bar, and an empty save shows the three errors and writes nothing
- a typo and a prefix find the right rows; Escape and the clear button empty the search
- the phone sheet's two links, and no door code in any link
- desktop's single Google Maps link
- delete asks first
- an edit clears a blanked optional field

Links and search themselves are tested in `../../../domain/addresses/addresses.test.ts`.
