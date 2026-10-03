# Larder in Nestead

Larder was designed as a standalone, single-device recipe app. Here it is a
feature of Nestead: the family's kitchen, next to the board, sharing its
accounts, its data layer and its look. This note records how the design maps
onto the code, and every place the integration departs from the original brief.

## Screens

| Design artboard                              | Route / state                         | Code                                   |
| -------------------------------------------- | ------------------------------------- | -------------------------------------- |
| Library (desktop, mobile)                    | `/library`                            | `features/larder/library/`             |
| Search, pantry fit (desktop, mobile)         | `/search?q=…&pantry=1`                | `features/larder/search/`              |
| Filters sheet (mobile)                       | Search → Filters                      | `search/FilterControls.tsx`            |
| Search, no results (desktop, mobile)         | any search with no hits               | `search/Search.tsx`                    |
| Recipe detail (desktop, mobile)              | `/recipe/:id`                         | `features/larder/detail/`              |
| Add recipe (desktop, mobile)                 | `/add`, `/add?edit=:id`               | `features/larder/add/`                 |
| Import from web (desktop, mobile)            | `/import`                             | `features/larder/import/`              |
| Diet profile (desktop, mobile)               | `/profile`                            | `features/larder/profile/`             |
| Pantry, and its empty state                  | `/pantry`                             | `features/larder/pantry/`              |
| Shopping list, and its empty state           | `/lists`                              | `features/lists/`                      |
| Cook mode, and timer done                    | `/recipe/:id/cook?step=6`             | `features/larder/cook/`, `timers/`     |

Shared pieces: the generic kit in `components/ui/` (buttons, chips,
segmented, switch, checkbox, radios, fields, stepper, empty state, sheet), and
the recipe pieces in `features/larder/recipe/` (card and row, photo and its
placeholder, stars, badges, match bar, status marker, step text).

## Decisions made for the integration

- **Family-shared, not per device.** Recipes, pantry, staples, diet profile and
  shopping list are Nestead collections, so they sync live between family
  members through Supabase and pass the same backend contract. Only cook-mode
  timers stay on the device.
- **One shell, one look.** Larder's sidebar and tab bar became Nestead's. The
  board is the first item and the home page; the kitchen items sit under a
  "Larder" heading. The board adopted Larder's palette and fonts; its
  behaviour did not change. The old dark mode went with it, since the kitchen
  design had none. Dark mode has since come back as "Slate and clay": the same
  token names redefined under `:root[data-theme='dark']` in
  `styles/tokens.css`, following the system setting unless someone picks
  Light or Dark (sidebar, or the Family page on a phone). Cook mode keeps its
  own dark tokens in both themes.
- **Essentials only.** Added `react-router-dom`, `lucide-react` and the two
  font packages, plus `@types/node` as a dev dependency for the dev-server
  import middleware. Not added: Zustand (the session and `useCollection`
  already do it), Dexie (Supabase and localStorage do it; photos use a small
  IndexedDB wrapper), dnd-kit (a native drag handle that also moves with the
  arrow keys), vite-plugin-pwa, cheerio (the import parser needs none),
  Testing Library and Playwright.
- **Import runs on Cloudflare.** `functions/api/import.ts` deploys with the
  existing workflow. Locally Vite mounts the same handler.

## Where it differs from the Larder brief

- **Routes.** `/` is the board, so the library is `/library`.
- **Tab bar.** Six tabs, not five: Board, Lists, Library, Search, Pantry,
  Profile. Member switching and sign-out stay on the board page. Since
  2026-10-04 the bar holds sections (four pinned, then More) and the Larder's
  pages are pills; see `src/app/README.md`.
- **The shopping list is for everything, not only food**, so it sits with the
  board, above the "Larder" heading, and its screen lives in `features/lists/`.
  It is split by where things are bought: **Supermarket**, where recipes put
  their groceries (still grouped by aisle); **General**, for everything else;
  and any sections the family adds (`list_groups`). Sections go in the family's
  own order, dragged by a grip or moved with its arrow keys (`useSectionDrag.ts`,
  `ShoppingList.tsx`); built-in sections get a row only once moved, to hold
  their place. Anything can be typed into
  any section, and an item's menu renames it, adds a note ("2 packs"), moves it
  to another section or takes it off. Something added by hand stays when the
  last recipe that also needed it comes off the list. Deleting a section moves
  its items to General. "Move to pantry" takes only groceries (Supermarket,
  recipe or catalog items); "Clear checked" takes everything ticked. The
  sidebar count is what is still to buy, not everything on the list.
- **Copy.** The diet profile says its scope once, as the subtitle ("Shared by
  the family, and applied everywhere.") instead of the brief's info box; the
  sidebar wordmark is Nestead with the jar mark.
- **Less text than the artboards** (September 2026). Recipe cards and rows show
  the title (two lines at most), one line of time, rating and what to buy, the
  fit bar and any diet warning; tags, description, calories, "You have 9/10",
  the need list and the source open from a toggle beside the bar. The recipe
  page puts time, calories and to-buy on one line with the rest behind a
  toggle, and drops the "What it requires" summary, the legend and the second
  shopping-list button. Counts replace sentences (the shopping list's "2/8",
  "Left off this list · 18", Import's "What we read"), subtitles that
  restated counts are gone, and learn-once hints (timers, arrow keys, swipes,
  pantry Enter) show until used on that device (`features/larder/hints.ts`).
  Search has one sort control, beside the results.
- **Library ratings** show the family's own rating when set, as the brief says,
  so One-Pan Lemon Chicken shows 4.0 where the artboard shows 4.6.
- **Step titles.** Cook mode shows "Step 6 of 7 · Bake" and "Next · Rest and
  serve". The brief's data model has no step titles, so `Step.title` was added
  as an optional field; recipes without one fall back to the first timer's verb.
- **Timer labels** follow the brief ("Chill"), not the artboard's "Chill sauce".
  A specific verb beats an oven mentioned elsewhere in the sentence; only a
  bare time or "cook" borrows "Oven".
- **Rounding.** Whole-number grams and millilitres show as written ("125 g");
  rounding to 5 or 10 applies to scaled amounts only.
- **Between 1024 and 1279px** recipe detail uses two equal columns and Add
  recipe a single column; the artboards' fixed widths apply from 1280.
- **Import.** The server returns ingredient lines as text and the browser
  parses them, so there is one parser. The "What we read" checklist is built
  from the parsed recipe.
- **"No results" suggestions** can also remove a single ingredient, and only
  suggestions that would find something are shown.
- **Additions not in the brief:** deleting a recipe (from its edit page, with a
  confirmation); "Save to library" on a web recipe's page; an error boundary
  with a Reload button.
- **Calories per 100 g** (September 2026). The recipe page's calorie details
  switch between per serving and per 100 g, remembered on the device. The
  figure spreads the recipe's calories over the finished dish's estimated
  weight: its ingredients plus the water dry rice, pasta and grains take up,
  with nothing taken off for water that boils away. Cards, sorting and the
  calorie filter stay per serving.
- **Peanuts apart from nuts** (September 2026). The brief's nut allergy
  covered peanuts and tree nuts; peanuts now have their own allergy switch.
  A profile saved before the split keeps peanuts covered until the family sets
  that switch, so nobody loses a warning they had.
- **Not built:** offline use (there is no service worker; the app does install
  to a home screen through `public/manifest.webmanifest`), Playwright
  end-to-end tests and the screenshot comparison. Verified instead by unit tests
  and by walking each screen at 360, 375, 768, 1024, 1280 and 1440px.

## The kitchen tables

The kitchen arrived in `supabase/migrations/20260924120000_kitchen.sql`, since
folded into `supabase/schema.sql`. A project without those tables fails the
Supabase contract suite, and its families see an empty kitchen; the board is
unaffected because `ensureKitchen()` never throws.
