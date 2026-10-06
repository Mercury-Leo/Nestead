# components
App-wide UI: the generic kit in `ui/`, the light and dark theme in `theme/`, and three shell pieces.

## Files
| File | Responsibility |
| --- | --- |
| `Brand.tsx` | `BrandMark` jar SVG and the "Nestead" link home. |
| `ErrorBoundary.tsx` | Catches a screen that failed to render and offers Reload; `resetKey` clears it. |
| `PageHeader.tsx` (+ `PageHeader.module.css`) | Serif page title, subtitle and actions. |
| `theme/theme.tsx` (+ `theme.test.ts`) | `ThemeProvider`, `useTheme()`, `readThemeChoice()`, `resolveTheme()`. |
| `theme/ThemeToggle.tsx` (+ `ThemeToggle.module.css`) | System, Light or Dark as a `Segmented`; `compact` shows icons only. |
| `ui/index.ts` | The barrel every consumer imports the kit from. |
| `ui/Button.tsx` (+ `Button.module.css`) | `Button`, `ButtonLink`, `IconButton`; sizes from 44px to 58px. |
| `ui/Chip.tsx` (+ `Chip.module.css`) | `Chip`, `RemovableChip`, `Tag`. |
| `ui/controls.tsx` (+ `controls.module.css`) | `Segmented`, `Switch`, `Checkbox`, `RadioList`, `TextField`, `Stepper` over native inputs. |
| `ui/EmptyState.tsx` (+ `EmptyState.module.css`) | Icon, title, body and actions for an empty screen. |
| `ui/SelectButton.tsx` (+ `SelectButton.module.css`) | A native `<select>` dressed as a button. |
| `ui/Sheet.tsx` (+ `Sheet.module.css`, `Sheet.test.tsx`) | Modal on `<dialog>`: a bottom sheet on phones, a dialog on desktop. On phones the page behind it stays still while it is open. Closing gives focus back to what opened it (`giveFocusBack()`). |
| `ui/icons.tsx` | `BackArrow`, `ForwardArrow`, `ForwardChevron`, `SignOutIcon`, mirrored in RTL. |
| `ui/cx.ts` | Joins truthy class names. |

## How it works
- `ThemeProvider` sets `data-theme` on `<html>`, which switches the tokens in `../styles/tokens.css`; the choice is a device preference (`theme/theme.tsx`).
- `index.html` applies the stored theme before first paint from `nestead:device:pref:theme`, the key `theme/theme.tsx` writes.
- Mirrored icons carry `flipRtl`, which `../styles/global.css` flips under `[dir='rtl']` (`ui/icons.tsx`).
- A sheet's `<dialog>` blocks clicks on the page behind it, not scrolling. Below 1024 px, `html:has(.sheet:modal)` hides the page's overflow while one is open, so a swipe on the backdrop or a short sheet leaves the page where it was, and closing it keeps the scroll position. Desktop is left alone: hiding a classic scrollbar there would shift the page sideways (`ui/Sheet.module.css`).
- `../app/Shell.tsx` wraps the routes in `ErrorBoundary`; the usual failure is a lazy chunk gone after a deploy (`ErrorBoundary.tsx`).

## Connections
- `ui/` uses only React, lucide-react, react-router-dom (`ButtonLink`) and react-i18next (`Sheet`); `theme/` uses `../data/local/localStore.ts` and `../hooks/useMediaQuery.ts`.
- Used by `../app/`, every folder in `../features/`, and `../features/larder/recipe/`, which imports `ui/cx.ts` directly.

## Rules & gotchas
- Only generic pieces go in `ui/`; anything that knows about recipes lives in `features/larder/recipe/` (`ui/index.ts`).
- Real `<button>`, `<a>` and `<input>` throughout, with touch targets of at least 44px (`ui/index.ts`).
- Colours differ between themes only through tokens; components never branch on the theme (`../styles/tokens.css` header).
- A `.visually-hidden` label is absolutely positioned: put it inside something positioned (`position: relative`), above all in a horizontally scrolling row. Otherwise it escapes the row's clipping and widens the page, and on a phone the browser then lays out fixed elements, the tab bar and every open sheet, against the wider page, partly off screen (`../features/activities/shows/ChipFilter.module.css`). `SelectButton` is already positioned.
- A sheet gives focus back to the element that had it as the sheet opened, both when `open` turns false and when the page stops rendering it while open (Add show, the Tags sheet): removing an open `<dialog>` without `close()` would drop focus to the page, so `Sheet` closes it in a layout-effect cleanup, while it is still in the page. It moves focus only when focus is still inside the sheet or on the page itself, so a screen that focuses something else as the sheet closes (a card brought into view) keeps that, and it moves none when nothing had focus at the start (a tap on a phone) (`ui/Sheet.tsx`).
- Files inside `ui/` import each other by file (`./cx`), never through the barrel `./`: the cycle makes `vite build` warn that the export "will end up in different chunks" once per lazy screen (`ui/SelectButton.tsx`).

## Tests
`theme/theme.test.ts`: follows the system until a choice, keeps an explicit choice, ignores unknown stored values, uses the key `index.html` reads. `ui/Sheet.test.tsx`: focus goes back to the opener when a sheet leaves the page and when it closes and stays, not when something outside has taken focus, and not when nothing had it.
