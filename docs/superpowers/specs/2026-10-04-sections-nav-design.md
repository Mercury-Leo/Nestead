# Sections navigation: design

- **Date:** 2026-10-04
- **Status:** Approved in chat, awaiting review of this written spec. Nothing here is implemented yet.
- **Scope:** Restructure the app's navigation around *sections* (Board, Lists, Larder, Activities, Family, …), so new sections can be added without running out of room on phones. Building Activities itself (searching for shows and movies to watch) is a separate, later project. This one only leaves a place for it.

## 1. Problem

`useNavItems()` in `src/app/Nav.tsx` returns one flat list of six items, and both the desktop sidebar and the phone tab bar render all of them. Larder is not a real section, only a heading above the item marked `larder: true`. The tab bar is already full: `Shell.module.css` has a rule for screens narrower than 380px that shrinks the tabs to fit. A seventh tab won't fit, and Family isn't in the nav at all; the only way to it is a button on the board.

## 2. Decisions

- **D1 Sections as bottom tabs (option A).** On phones, the bottom bar holds sections, not pages. A section with more than one page shows its pages as pills at the top of the screen. Two alternatives were rejected. In the first, the bar shows the current section's pages and a title switcher changes section; that costs two taps to change section, and the bar changes under your thumb. In the second, four flat tabs plus More; that splits Larder's pages between the bar and More, and More grows with every section.
- **D2 Four pinned sections plus More.** The bar always has five slots: four sections and More. More lists every section.
- **D3 Pins are per person and per device.** Every family sees every section. Each person chooses which four sections go in their phone's bar, and the choice is a device preference with no database change. Two alternatives were rejected: letting a family hide sections (a schema change, not needed yet), and a fixed order nobody can change.
- **D4 One list of sections.** A new `src/app/sections.ts` defines every section and its pages. The sidebar, tab bar, More sheet and page pills all render from it, and adding a section means adding one entry.
- **D5 URLs don't change.** `/library`, `/pantry` and the rest keep their paths. The section list says which section each path belongs to, so bookmarks and existing links keep working.
- **D6 Desktop sidebar folds.** The sidebar lists every section. The current section opens to show its pages; the others take one line each.

## 3. The section list

`src/app/sections.ts` (React-free data and pure functions, plus one hook for live counts):

```ts
interface SectionPage {
  path: string;            // the route, e.g. '/library'
  labelKey: NavKey;        // i18n key, e.g. 'nav.library'
  icon: LucideIcon;
  end?: boolean;           // exact match only (the board's '/')
  also?: string[];         // other path prefixes that light this page: Library has ['/recipe', '/add', '/import']
}

interface Section {
  id: SectionId;           // 'board' | 'lists' | 'larder' | 'family' (Activities adds 'activities')
  labelKey: NavKey;
  icon: LucideIcon;
  pages: SectionPage[];    // first page is where the section opens
  pinnable?: false;        // Family: never in the bar, always in More / the bottom of the sidebar
}

export const SECTIONS: Section[];
export function locate(pathname: string): { section: Section; page: SectionPage } | undefined;
export function resolvePins(stored: unknown): SectionId[];
```

Initial entries, in order:

| id | Pages | Notes |
| --- | --- | --- |
| `board` | `/` (end) | |
| `lists` | `/lists` | Stays on its own: the shopping list is for everything, not only food. |
| `larder` | `/library` (+ `/recipe`, `/add`, `/import`), `/search`, `/pantry`, `/profile` | Labels: Library, Search, Pantry, Diet. |
| `family` | `/family` | `pinnable: false`. The Family button on the board stays. |

**Counts** stay per page, as today. A `useSectionCounts()` hook in `Nav.tsx` maps page paths to counts: open tasks for `/`, unchecked items for `/lists`, recipes for `/library` and have-now items for `/pantry`. Counts are shown only in the desktop sidebar, as now; the phone bar doesn't show them.

**`locate(pathname)`** returns the section and page that light up for a path. A page matches if the path equals it (`end`) or starts with its path or one of its `also` prefixes. If more than one page matches, the longest prefix wins. Paths that match nothing, such as unknown URLs, return `undefined`; nothing is lit, and the router redirects them to `/` anyway.

## 4. Phone

- **Bar.** The bar shows the pinned sections in `SECTIONS` order, followed by More. Tapping a section goes to its first page. A section is lit when `locate()` puts the current path in it.
- **Default pins.** The first four pinnable sections in `SECTIONS`. Today there are only three (Board, Lists, Larder), so the bar has three sections and More until Activities arrives.
- **More.** More is a button with `aria-haspopup="dialog"` that opens the existing `Sheet`. It is lit when the current section isn't pinned, so the bar still shows roughly where you are.
- **Page pills.** When the current section has more than one page, a small `<nav aria-label="{section} pages">` of pill links sits at the top of `<main>`, rendered by `Shell`. The current pill has `aria-current="page"`. Pills only show on phones; on desktop the sidebar already lists the pages. They're hidden wherever the bar is hidden: all `/recipe/` paths and cook mode.
- **Hidden bar.** Recipe pages and cook mode hide the bar, as today.

### 4.1 More sheet

- Title "More". The body is a grid with one tile per section in `SECTIONS`, Family included, each showing the section's icon and label.
- **Normal mode:** a tile is a link to the section's first page. Following it closes the sheet.
- **Edit bar mode:** an "Edit bar" button in the sheet switches every pinnable tile into a toggle (`aria-pressed`); Family's tile is disabled for pinning and says why in its accessible name. A status line (`aria-live="polite"`) reads "3 of 4 in the bar".
  - While four are pinned, tapping an unpinned tile changes nothing and the status line changes to "Unpin one first". Pins are never swapped silently.
  - At least one section must stay pinned. Unpinning the last one is refused the same way, with "Keep at least one".
  - "Done" leaves edit mode. Every toggle is saved immediately, so there's nothing to cancel.

### 4.2 Saving pins

- Pins are saved with `writePreference(familyId, 'navPins', ids)` and read with `readPreference(...)` from `src/data/local/localStore.ts`, keyed per family like the board filters.
- `resolvePins(stored)`:
  1. Starts from the stored value if it's an array of strings, and otherwise falls back to the default pins.
  2. Removes unknown, duplicate and unpinnable ids.
  3. Sorts what's left into `SECTIONS` order and keeps at most four.
  4. Falls back to the defaults if nothing is left.
- So when a section is removed from the code, it drops out of the bar on its own.

## 5. Desktop sidebar

- Brand, then every section except Family in `SECTIONS` order, then Family near the bottom above the theme toggle.
- A single-page section takes one line, linking to its page, with its count.
- A multi-page section takes a header line. Clicking it goes to the section's first page. While you're in that section, its pages are listed indented under it, each with its count.
  - There's no separate chevron toggle: a section is open while you're in it and closed otherwise, so nobody has open and closed state to manage.
- The diet card (the rules that filter every search, as one link to `/profile`) stays. It now shows only while you're in Larder, under Larder's pages.
- `aria-current="page"` goes on the current page's link. A section header gets it only when the section has one page.

## 6. Accessibility, RTL and text

- The sidebar and the bar each stay one `<nav aria-label={t('nav.main')}>`; the page pills are a second, separately labelled `<nav>`.
- Every touch target in the bar, pills and sheet tiles is at least 44px tall.
- Layout uses logical properties (`inset-inline-*`, `margin-inline-*`) so Hebrew mirrors correctly, matching the current CSS.
- New keys, in both `en.json` and `he.json`:
  - `nav.more`, `nav.editBar`, `nav.done`
  - `nav.pinnedCount` (with count)
  - `nav.barFull`, `nav.keepOne`, `nav.notPinnable`
  - `nav.sectionPages` (with section)
  - `nav.family`, `nav.diet`
- `nav.profile` stays as long as anything else uses it. If the Larder page label changes from "Profile" to "Diet", the profile page's own heading doesn't change.

## 7. Files

| File | Change |
| --- | --- |
| `src/app/sections.ts` | New: `SECTIONS`, `locate()`, `resolvePins()`, types. |
| `src/app/sections.test.ts` | New (§8). |
| `src/app/Nav.tsx` | `Sidebar` and `TabBar` render from `SECTIONS`; new `MoreSheet`, `PagePills`, `useSectionCounts()`, `usePins()`. `useNavItems()` and `isActive()` are removed. |
| `src/app/Nav.test.tsx` | New (§8). |
| `src/app/Shell.tsx` | Renders `PagePills` at the top of `<main>` when the bar is shown. |
| `src/app/Shell.module.css` | Styles for section groups, pills, More tile grid; the under-380px tab rule is revisited since the bar now has five slots at most. |
| `src/i18n/locales/en.json`, `he.json` | Keys from §6. |
| `src/app/README.md` | Files table, how it works, rules (§9). |
| `CLAUDE.md` | The `src/app/` row mentions sections. |

No change to `AppRoutes.tsx`, routes, lazy loading, the `page()` wrapper, the `DataStore`, or the schema.

## 8. Tests

`src/app/sections.test.ts`:
- **`locate()`:**
  - `/` is Board and `/board-thing` is not, because of `end`.
  - `/library`, `/recipe/abc`, `/recipe/abc/cook`, `/add` and `/import` are Larder → Library.
  - `/search`, `/pantry` and `/profile` are Larder's other pages.
  - `/lists` is Lists, `/family` is Family, and `/nope` is `undefined`.
- **Every route has a section:** each `path` in `AppRoutes.tsx` except `*` matches a page, so a route added without a section fails. The test reads the file's `<Route path=…>` values, the same way `literals.test.ts` reads source.
- **`resolvePins()`:**
  - `undefined`, a non-array, or an empty array gives the defaults.
  - Unknown, duplicate and `family` ids are dropped.
  - Five valid ids are cut to four.
  - The result follows `SECTIONS` order.
- **Section list sanity:** ids are unique, every section has at least one page, page paths are unique, and every `labelKey` exists in `en.json` and `he.json`.

`src/app/Nav.test.tsx` (jsdom, demo session, `MemoryRouter`):
- The bar shows the default pinned sections plus More, and Larder is lit on `/recipe/x`.
- More opens the sheet, and tapping a tile navigates and closes it.
- Edit bar:
  - Unpinning removes a section from the bar, and pinning adds it back.
  - A fifth pin is refused with the status message, and so is unpinning the last pin.
  - The choice survives a remount, because it's stored as a preference.
- More is lit on a section that isn't pinned.
- The page pills show on `/pantry` with Pantry current, and don't show on `/` or `/lists`.

**Manual check:** in the demo dev server, at 375px and at desktop width, in light and dark mode, and in Hebrew. Screenshots go to the user.

## 9. Docs

- **`src/app/README.md`:** replace the "six nav items" rule with a new section, "Adding a section", covering:
  - add an entry to `SECTIONS`
  - add its routes in `AppRoutes.tsx`; `sections.test.ts` fails if a route has no section
  - add its label keys
  - optionally add a count in `useSectionCounts()`
- Also note that pins are a per-family device preference named `navPins`.

## 10. Out of scope

- The Activities section, its search API and its data. That's the next project; it adds one `SECTIONS` entry.
- Letting a family hide sections (needs a family setting in the database).
- Drag to reorder the bar.
- Counts or badges on phone tabs.
- Moving URLs under section prefixes.
