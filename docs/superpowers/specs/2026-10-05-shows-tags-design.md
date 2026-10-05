# Shows tags: design

- **Date:** 2026-10-05
- **Status:** Approved in chat, awaiting review of this written spec. Nothing here is implemented yet.
- **Scope:** Let the family tag shows with their own labels ("Bad movie", "Christmas", "Movie night"), see the tags on each card, and filter and search by them. Branch `shows/tags`.

## 1. Problem

The Shows page can filter by status, kind and genre, but genres are IMDb's. The family has its own ways of grouping what they watch (the bad movies they enjoy, the ones for Christmas, the ones to watch with grandma), and nothing on a show can hold that. Recipes already have free-text tags (`Recipe.tags`); shows need the same idea, with a filter like the genre one.

## 2. Decisions

- **D1 Chips under the genres (option A).** A tagged card gets a row of chips under its genres line. Two alternatives were rejected. Tags at the end of the genres line add no height, but the line is cut short with an ellipsis, so tags get lost behind a long genre list. A band across the bottom of the poster looks strong but fits one short tag in 84px, with the rest as "+1".
- **D2 Tags belong to the whole family**, like the favourite star: one member's tag is everyone's tag.
- **D3 Tags are typed on a show.** A show's Tags sheet offers every tag already in use and takes a new one. There is no list of tags to manage: the family's tags are the tags on its shows, so a tag nobody uses any more is gone. A managed list (its own table, a screen to create, rename, colour and delete tags) was rejected for now.
- **D4 A Tags control of its own**, beside Genres in the toolbar, rather than a Tags section inside the Genres sheet. It keeps the family's labels apart from IMDb's data.
- **D5 Picking several tags matches shows with all of them**, as genres do: Bad movie and Christmas lists bad Christmas movies. Tags and genres combine the same way.
- **D6 The search finds tags** by the start of one of their words, as it finds genres.

## 3. Data

`supabase/migrations/20261005140000_shows_tags.sql`, the same change in `supabase/schema.sql`'s `shows` table, and `Show.tags` in `src/domain/types.ts`:

```sql
-- The family's own labels for a show ("Bad movie"), typed by its members and
-- kept as typed. Shared by the whole family. Empty: no tags.
alter table shows add column tags text[] not null default '{}'
  check (cardinality(tags) <= 20 and array_position(tags, null) is null);
```

```ts
/**
 * The family's own labels ("Bad movie"), kept as typed and never translated.
 * Absent counts as none; removing the last tag writes [].
 */
tags?: string[];
```

- Existing rows get `{}`. Unlike genres, there is no "never read" state, so nothing needs filling in.
- The column is `not null`: clearing tags writes `[]`, never `undefined` (which the adapter sends as NULL).
- No adapter changes are expected: both backends map row fields generically. The contract case (section 9) proves it.
- Writes replace the whole list. Two devices changing one show's tags at the same moment: the later write wins.
- A refresh never writes `tags` (`REFRESHED_FIELDS` in `src/domain/shows.ts` does not list it), nor does a status change, a drop, a restore or the star.

## 4. Rules for a tag (`src/domain/shows.ts`, pure)

- `tidyTag(text)`: trims, folds runs of white space to one space, and cuts to 30 characters. An empty result is no tag.
- `familyTags(shows)`: every tag on any show, each spelling once. Two spellings that differ only in case count as one: the first met wins.
- `withTag(tags, typed, known)`: adds a typed tag to a show's list, using the spelling from `known` (the family's tags) when one matches regardless of case, so "bad movie" becomes "Bad movie". Adding a tag the show already has changes nothing. Refused past 20.
- Case is compared with `toLocaleLowerCase()`. Tags are stored and shown as typed, in any language, never translated, rendered with `dir="auto"`.

## 5. The card (`ShowCard.tsx`)

- `Tags` renders under `Genres` only when the show has at least one tag: a `role="list"` of chips, each with lucide's `Tag` icon, wrapping onto more lines as needed. Every tag is shown.
- Chips are 28px tall with 6px gaps (above WCAG 2.5.8's 24px target; a 44px hit area like the status badge's would make tagged cards much taller).
- The chip colour is a new token pair in `src/styles/tokens.css`, `--tag-tint` and `--tag-ink`, redefined for dark mode: a hue distinct from the accent, sage, honey and the status badges, with the ink at 4.5:1 or better on the tint in both themes.
- A chip is a button. Its accessible name is "Show only shows tagged Bad movie" (`shows.tags.filterBy`). Pressing it adds that tag to the Tags filter, leaving the other filters as they are (the card already matches them), and scrolls to the top of the list. A tag already picked changes nothing but the scroll. `ShowCard` takes an `onTag(tag)` prop for this; the page passes one stable callback, and the memo comparison includes it.
- `sameShow()` compares `tags` item by item, as it does `genres`.
- `contain-intrinsic-size` stays the poster's height: most cards have no tags, and a tagged card with a one-line title still fits beside the poster.
- The genre control's icon changes from `Tags` to `Drama` (theatre masks), so the two controls are told apart.

## 6. The Tags sheet (`TagSheet.tsx`, new)

Opened by a **Tags** button (`Tag` icon) in the card's details, beside Refresh, Drop it and Delete.

- Title: "Tags for ‹title›" (`shows.tags.sheetTitle`, a `<Trans>` with the title in a named `<item/>` slot inside `<bdi>`, never a value).
- Hint: "Shared with your family. Tap to add or remove." When the family has no tags yet: "Group shows your own way, like Bad movie or Christmas."
- A text field (`maxLength` 30, placeholder "Add a tag"). Typing narrows the chips to tags containing what is typed, regardless of case. When no tag matches it exactly (regardless of case), the first chip is **Add "‹typed›"**; Enter does the same. Adding clears the field and saves.
- The chips: every family tag (`familyTags()` over every show, not only those the filters list), A to Z by `Intl.Collator` in the screen's language, `aria-pressed` for the ones this show has (a check icon) and a plus icon for the rest. A press saves at once through `setTags()`.
- A tag taken off its last show stays in the sheet until it closes, so it can be put back: the sheet keeps the tags it opened with, plus any added while open.
- At 20 tags the field is disabled and says "A show can have up to 20 tags."
- Footer: **Done**, which closes the sheet. There is no separate save.
- `setTags(store, show, tags)` in `shows/actions.ts` writes `{ tags }`. A failed write is caught like the other card actions; the cache rolls it back.

Adding a show stays as it is: no tags in the add sheet.

## 7. The filter (`Shows.tsx`)

- `GenrePicker` becomes a generic chip filter (`ChipFilter.tsx`) taking a label, an icon, the option label function, and the hint, empty, picked and done strings. Genres pass `genreLabel()`, Tags pass the tag as is. Both keep the `position: relative` rule that holds the hidden label inside the phone's chip row (`8c4516c`).
- The Tags control shows once any show in the family has a tag (whatever the filters), or while a tag is picked (so a tag picked on an earlier visit can still be taken off).
- Its sheet: tag chips with counts among the shows listed now (`tagCounts()`), only those that would list something plus those picked, Clear, Show N shows. A show must have every tag picked.
- The status counts follow the tags, as they follow kind and genres.
- Show all and the reveal after Add show clear tags with the genres (`reveal()`).
- `filterShows()` takes `tags?: readonly string[]`: a show must have each one.

## 8. Search and the saved view

- `filterShows()`: each search word must match the title, a genre or a tag. A tag is matched like a genre, by the start of one of its words or the whole tag run together: "bad" and "mov" find "Bad movie", "ad" does not. One helper serves both.
- `ShowView` gains `tags: string[]` (stored as typed, cap 20). `parseShowView()` reads a view saved before tags as no tags picked.
- `keyOf()` in `Shows.tsx` includes the tags, so a change of tag filter starts from one page.

## 9. Tests

- `src/domain/shows.test.ts`: `tidyTag()` trims, folds spaces, cuts at 30, refuses empty; `withTag()` reuses a known spelling regardless of case, ignores a repeat, refuses a 21st; `familyTags()` keeps one spelling; `filterShows()` with two tags (all must match), tags with genres, search by a tag's word start ("bad", "mov" yes; "ad" no); `tagCounts()`; `parseShowView()` on a view without tags; `refreshPatch()` leaves tags alone.
- `ShowCard.test.tsx`: chips only on tagged shows; a chip's name for a screen reader; pressing one calls `onTag`; `sameShow()` sees a changed, added and cleared tag list.
- `TagSheet.test.tsx` (new): adding a new tag; typing another case of a known tag adds the known spelling; taking a tag off its last show keeps it in the sheet until it closes; the 20-tag limit; the empty-family hint.
- `Shows.test.tsx` (local store): no Tags control until a show has a tag; picking a tag narrows the list and the status counts; a chip press on a card filters by its tag; Clear; a reveal after Add show clears tags.
- `actions.test.ts`: `setTags()` writes the list; tags kept through a status change, a drop and a restore, a refresh and starring.
- `src/data/collection.contract.ts`: a show's tags round-trip as a list, are replaced whole, and are cleared by writing `[]`. Runs against Supabase too when `.env.test` is present.

## 10. Rollout

1. Build on `shows/tags` in `../.worktrees/shows-tags`; the shared checkout never switches branch.
2. The user applies the migration to production before deploying: once the code ships, saving a tag writes the column.
3. Run the live Supabase suites against it.
4. Update the READMEs on the branch: `src/features/activities/`, `src/domain/`, `src/data/`, `supabase/`, and `src/i18n/` for the new keys (English and Hebrew).
5. Fast-forward into main and push; check the deploy.

## 11. Not in this version

- Renaming, merging or deleting a tag across every show at once. A typo is fixed by untagging the shows that have it.
- A colour per tag.
- Tags in the add sheet.
- Personal (per-member) tags.

Each would need the managed list D3 rejected, or a change to D2, and can come later if missed.
