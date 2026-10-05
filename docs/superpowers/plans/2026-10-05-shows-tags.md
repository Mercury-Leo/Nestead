# Shows Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the family tag shows with their own labels ("Bad movie"), see the tags as chips on each card, filter by them from a Tags control beside Genres, and find them in the search.

**Architecture:** A `tags text[] not null default '{}'` column on `shows`, mirrored as `Show.tags?: string[]`; no new table and no adapter changes. The rules for a tag (tidying, case folding, counting, filtering, search) are pure functions in `src/domain/shows.ts`. `GenrePicker` becomes a generic `ChipFilter` used for genres and tags. Cards show tags as chips that add their tag to the filter; a page-level `TagSheet` edits one show's tags and saves each press through `setTags()`.

**Tech Stack:** React 18, TypeScript strict, i18next (keys typed from `en.json`), lucide-react 1.47, CSS modules, Vitest 2 + jsdom, PGlite for SQL tests, Supabase (Postgres).

**Spec:** `docs/superpowers/specs/2026-10-05-shows-tags-design.md`

## Global Constraints

- **Branch and worktree.** Work in `C:\Users\Mercury\Claude Projects\Nestead\.worktrees\shows-tags` on branch `shows/tags`. Never switch the shared checkout (`..\..\Nestead`) off `main`. Run every command from the worktree.
- **Limits.** At most 20 tags per show (`MAX_TAGS = 20`, enforced by the database too); at most 30 characters per tag (`MAX_TAG_LENGTH = 30`, app only).
- **Case.** Spellings that differ only in case are one tag, compared with `toLocaleLowerCase()`. A typed tag takes the spelling the family already uses.
- **Never `undefined` for tags.** The column is not null: removing the last tag writes `[]`.
- **Tags are not translated.** Stored and shown as typed, wrapped in `<bdi>` where they sit inside other text.
- **Refresh never writes `tags`.** Do not add it to `REFRESHED_FIELDS`.
- **Every UI string goes through `t()`.** New keys go in both `src/i18n/locales/en.json` and `he.json`. `src/i18n/i18n.test.ts` checks that both files have the same keys, the same `{{placeholders}}` and `<tags/>`, and every plural category (Hebrew: `_one`, `_two`, `_other`). Use `{{max, number}}`, not `count`, where a number is not a plural.
- **Styling.** CSS modules; colours only from tokens in `src/styles/tokens.css` (new ones get a light value and a `:root[data-theme='dark']` value); logical properties so Hebrew mirrors.
- **Before editing a folder, read its README's "Rules & gotchas"**, and update that README on this branch (the merge hook `../.claude/hooks/docs-on-merge.mjs` blocks merging otherwise).
- **Commits.** Stage explicit paths only. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push: a push to `main` deploys, and the rollout (after Task 8) needs the user.
- **Live suites.** The worktree has no `.env.test`, so `npm test` skips the live Supabase suites. They run once, at rollout, after the user applies the migration.

## Before you start

- [ ] Link `node_modules` into the worktree (it is gitignored), from PowerShell in the worktree:

```powershell
New-Item -ItemType Junction -Path node_modules -Target "..\..\Nestead\node_modules"
```

Never `rm -rf node_modules` here: that deletes the main checkout's packages through the junction. Remove the junction with `cmd /c rmdir node_modules`.

- [ ] Check the baseline is green: `npx vitest run src/domain/shows.test.ts src/features/activities tests/sql/shows.test.ts src/data/local/localStore.test.ts src/data/cache.test.ts src/i18n` → all pass.

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20261005140000_shows_tags.sql` (new) | Adds `shows.tags`. |
| `supabase/schema.sql` | The same column in `create table shows`. |
| `src/domain/types.ts` | `Show.tags?: string[]`. |
| `tests/sql/shows.test.ts` | The column's default and checks on PGlite. |
| `src/data/collection.contract.ts` | Tags round-trip on every backend. |
| `src/domain/shows.ts` (+ `shows.test.ts`) | `MAX_TAGS`, `MAX_TAG_LENGTH`, `sameTag()`, `tidyTag()`, `withTag()`, `tagCounts()`, `familyTags()`, `hasTags()`; `filterShows()` with `tags` and tags in the search; `ShowView.tags`. |
| `src/features/activities/shows/actions.ts` (+ test) | `setTags()`. |
| `src/features/activities/shows/ChipFilter.tsx` (+ `.module.css`), renamed from `GenrePicker` | The genre and tag filter control and sheet. |
| `src/features/activities/shows/Shows.tsx` (+ `Shows.test.tsx`) | The Tags control, `view.tags`, `filterByTag`, and the page-level `TagSheet`. |
| `src/features/activities/shows/ShowCard.tsx` (+ `.module.css`, test) | `Tags` chips, `onTag` and `onEditTags` props, the Tags button in the details, `sameShow()` on tags. |
| `src/features/activities/shows/TagSheet.tsx` (+ `.module.css`, `TagSheet.test.tsx`) (new) | One show's tags. |
| `src/styles/tokens.css` | `--tag-tint`, `--tag-ink`. |
| `src/i18n/locales/en.json`, `he.json` | `shows.filter.*` (moved from `shows.genres`), `shows.tags.*`. |
| READMEs: `supabase/`, `src/data/`, `src/domain/`, `src/components/`, `src/features/activities/` | Docs, in the task that changes each. |

---

### Task 1: The `tags` column

**Files:**
- Create: `supabase/migrations/20261005140000_shows_tags.sql`
- Modify: `supabase/schema.sql` (the `genres` line in `create table shows`, around line 826)
- Modify: `src/domain/types.ts` (the `Show` interface, after `genres`)
- Test: `tests/sql/shows.test.ts`, `src/data/collection.contract.ts`
- Docs: `supabase/README.md`, `src/data/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `Show.tags?: string[]` (absent on a new local row, `[]` on a new Supabase row); the Postgres constraint `shows_tags_check`.

- [ ] **Step 1: Write the failing SQL test.** In `tests/sql/shows.test.ts`, after the `it('keeps genres as a list of up to ten, NULL until read', …)` case, add:

```ts
  it('keeps tags as a list of up to twenty, empty by default and never NULL', async () => {
    const [row] = await as<{ tags: string[] }>(USER_A, INSERT, [FAMILY_A, 'tt1375666']);
    expect(row?.tags).toEqual([]);
    const set = `update shows set tags = $1 where imdb_id = 'tt1375666' returning tags`;
    for (const tags of [['Bad movie', 'סרט רע'], [], Array.from({ length: 20 }, (_, i) => `T${i}`)]) {
      await expect(as(USER_A, set, [tags])).resolves.toEqual([{ tags }]);
    }
    await expect(as(USER_A, set, [Array.from({ length: 21 }, (_, i) => `T${i}`)])).rejects.toThrow(/shows_tags_check/);
    await expect(as(USER_A, set, [['Bad movie', null]])).rejects.toThrow(/shows_tags_check/);
    await expect(as(USER_A, set, [null])).rejects.toThrow(/null value in column "tags"/);
  });
```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run tests/sql/shows.test.ts` → the new case fails with `column "tags" does not exist`.

- [ ] **Step 3: Add the column.** Create `supabase/migrations/20261005140000_shows_tags.sql`:

```sql
-- Shows: tags, the family's own labels for a show ("Bad movie").
--
-- Run this against a database that already has 20261004120000_shows.sql.
-- schema.sql itself has been updated to include this, so a fresh project needs
-- only that file and not this one.
--
-- Existing rows get an empty list. Members type tags on a show; they are kept
-- as typed, never translated, and shared by the whole family. Apply this
-- before deploying tags: saving a show's tags writes the column.

alter table shows add column tags text[] not null default '{}'
  check (cardinality(tags) <= 20 and array_position(tags, null) is null);
```

In `supabase/schema.sql`, replace:

```sql
  genres        text[]      check (genres is null or (cardinality(genres) <= 10 and array_position(genres, null) is null)),
  fetched_at    timestamptz not null,
```

with:

```sql
  genres        text[]      check (genres is null or (cardinality(genres) <= 10 and array_position(genres, null) is null)),
  -- The family's own labels ("Bad movie"), kept as typed and never translated.
  -- Shared by the whole family; empty for none.
  tags          text[]      not null default '{}'
                            check (cardinality(tags) <= 20 and array_position(tags, null) is null),
  fetched_at    timestamptz not null,
```

In `src/domain/types.ts`, in `interface Show`, after the `genres?: string[];` line, add:

```ts
  /**
   * The family's own labels ("Bad movie"), kept as typed and never translated.
   * Absent counts as none; removing the last one writes [], since the backend's
   * column is not null.
   */
  tags?: string[];
```

- [ ] **Step 4: Run it to see it pass.** `npx vitest run tests/sql/shows.test.ts` → all pass.

- [ ] **Step 5: Add the contract case.** In `src/data/collection.contract.ts`, after the `it('shows keep genres as a list, tell an empty one from none, and replace it whole', …)` case, add:

```ts
    it('shows keep tags as a list, replace it whole, and clear it with an empty one', async () => {
      const base = { kind: 'movie' as const, title: 'X', fetchedAt: '2026-10-05T08:00:00.000Z', status: 'to-watch' as const };
      const show = await store.shows.create({ ...base, imdbId: 'tt0088764' });
      // None yet: absent on a new local row, [] where the backend defaults the column.
      expect(show.tags ?? []).toEqual([]);

      expect((await store.shows.update(show.id, { tags: ['Bad movie', 'סרט רע'] })).tags).toEqual(['Bad movie', 'סרט רע']);
      expect((await store.shows.list())[0]?.tags).toEqual(['Bad movie', 'סרט רע']);
      expect((await store.shows.update(show.id, { tags: ['Christmas'] })).tags).toEqual(['Christmas']);
      expect((await store.shows.update(show.id, { tags: [] })).tags).toEqual([]);
      expect((await store.shows.list())[0]?.tags).toEqual([]);
    });
```

- [ ] **Step 6: Run the contract on the local backends.** `npx vitest run src/data/local/localStore.test.ts src/data/cache.test.ts` → pass. (It passes at once locally, which stores any field; the Supabase run at rollout is the one that needs the column.) Then `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Docs.** In `supabase/README.md`:
  - After the row for `migrations/20261005130000_shows_genres.sql`, add:
    `| \`migrations/20261005140000_shows_tags.sql\` | \`shows.tags\` (\`text[]\`, not null, empty by default, at most twenty, no null items): the family's own tags. |`
  - Replace `NULL only on rows from before genres until read again (\`schema.sql\`).` with `NULL only on rows from before genres until read again; \`tags\` is the family's own labels as typed, empty for none and never NULL (\`schema.sql\`).`
  - At the end of the bullet that starts `- The live contract suite tests \`shows\``, append: ` And apply \`migrations/20261005140000_shows_tags.sql\` before deploying tags: the list still opens without it, but saving a show's tags writes \`tags\` and fails.`

  In `src/data/README.md`:
  - Replace `the eleven cases every backend must pass` with `the twelve cases every backend must pass`.
  - After the bullet that starts `- A show's \`favorite\` is absent on a new local row`, add:
    `- A show's \`tags\` is absent on a new local row and \`[]\` on a Supabase one (the column defaults to empty and is not null), so read it as \`show.tags ?? []\`. Remove the last tag by writing \`[]\`: patching it to \`undefined\` writes NULL there, which the column refuses.`
  - Replace `\`20261005120000_shows_favorite.sql\` and \`20261005130000_shows_genres.sql\` are applied to that project` with `\`20261005120000_shows_favorite.sql\`, \`20261005130000_shows_genres.sql\` and \`20261005140000_shows_tags.sql\` are applied to that project`.
  - Replace `a second shows case keeps genres as a list, an empty list apart from none, and replaces it whole. On Supabase they need \`../../supabase/migrations/20261004150000_shows_dropped.sql\`, \`20261005120000_shows_favorite.sql\` and \`20261005130000_shows_genres.sql\` applied.` with `a second shows case keeps genres as a list, an empty list apart from none, and replaces it whole; a third keeps tags as a list, replaces it whole and clears it with \`[]\`. On Supabase they need \`../../supabase/migrations/20261004150000_shows_dropped.sql\`, \`20261005120000_shows_favorite.sql\`, \`20261005130000_shows_genres.sql\` and \`20261005140000_shows_tags.sql\` applied.`

- [ ] **Step 8: Commit.**

```bash
git add supabase/migrations/20261005140000_shows_tags.sql supabase/schema.sql src/domain/types.ts tests/sql/shows.test.ts src/data/collection.contract.ts supabase/README.md src/data/README.md
git commit -m "Shows: a tags column, the family's own labels for a show

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The rules for a tag, the filter and the search

**Files:**
- Modify: `src/domain/shows.ts`
- Test: `src/domain/shows.test.ts`
- Docs: `src/domain/README.md`

**Interfaces:**
- Consumes: `Show.tags` (Task 1).
- Produces (used by Tasks 3-7), all exported from `src/domain/shows.ts`:
  - `const MAX_TAGS = 20`, `const MAX_TAG_LENGTH = 30`
  - `function sameTag(a: string, b: string): boolean`
  - `function tidyTag(text: string): string`
  - `function withTag(tags: readonly string[], typed: string, known: readonly string[]): readonly string[]` (returns the same array when nothing changes)
  - `function tagCounts(shows: readonly Show[]): Map<string, number>`
  - `function familyTags(shows: readonly Show[]): string[]`
  - `function hasTags(show: Show, tags: readonly string[]): boolean`
  - `ShowFilter.tags?: readonly string[]`; `ShowView.tags: string[]`; `DEFAULT_SHOW_VIEW.tags = []`

- [ ] **Step 1: Write the failing tests.** In `src/domain/shows.test.ts`, add to the import list: `MAX_TAGS`, `MAX_TAG_LENGTH`, `familyTags`, `hasTags`, `sameTag`, `tagCounts`, `tidyTag`, `withTag`. After the `describe('genres', …)` block, add:

```ts
describe('tags', () => {
  const sharknado = show('Sharknado', { genres: ['Action', 'Comedy'], tags: ['Bad movie', 'Movie night'] });
  const elf = show('Elf', { genres: ['Comedy'], tags: ['Christmas'] });
  const santa = show('Santa Claus Conquers the Martians', { genres: ['Sci-Fi'], tags: ['bad movie', 'Christmas'] });
  const plain = show('Plain Entry');
  const shelf = [sharknado, elf, santa, plain];
  const none = { query: '', status: 'all', kind: 'all' } as const;

  it('keeps shows with every tag picked, whatever the case', () => {
    expect(titles(filterShows(shelf, { ...none, tags: ['Bad movie'] }))).toEqual(['Sharknado', 'Santa Claus Conquers the Martians']);
    expect(titles(filterShows(shelf, { ...none, tags: ['BAD MOVIE', 'christmas'] }))).toEqual(['Santa Claus Conquers the Martians']);
    expect(filterShows(shelf, { ...none, tags: ['Bad movie', 'Nope'] })).toEqual([]);
    expect(filterShows(shelf, { ...none, tags: [] })).toEqual(shelf);
    expect(hasTags(plain, [])).toBe(true);
    expect(hasTags(plain, ['Christmas'])).toBe(false);
  });

  it('combines tags with genres', () => {
    expect(titles(filterShows(shelf, { ...none, tags: ['Christmas'], genres: ['Comedy'] }))).toEqual(['Elf']);
  });

  it('finds a tag by the start of its words, never by the middle', () => {
    expect(titles(filterShows(shelf, { ...none, query: 'bad' }))).toEqual(['Sharknado', 'Santa Claus Conquers the Martians']);
    expect(titles(filterShows(shelf, { ...none, query: 'mov' }))).toEqual(['Sharknado', 'Santa Claus Conquers the Martians']);
    expect(titles(filterShows(shelf, { ...none, query: 'christmas bad' }))).toEqual(['Santa Claus Conquers the Martians']);
    expect(titles(filterShows(shelf, { ...none, query: 'badmovie' }))).toEqual(['Sharknado', 'Santa Claus Conquers the Martians']);
    // "ovie" is inside Movie, but starts none of its words, and no title has it.
    expect(filterShows(shelf, { ...none, query: 'ovie' })).toEqual([]);
  });

  it('counts each tag, two spellings as one, spelled as first met', () => {
    expect(Object.fromEntries(tagCounts(shelf))).toEqual({ 'Bad movie': 2, 'Movie night': 1, Christmas: 2 });
    expect(tagCounts([]).size).toBe(0);
  });

  it("lists the family's tags once each", () => {
    expect(familyTags(shelf)).toEqual(['Bad movie', 'Movie night', 'Christmas']);
    expect(familyTags([plain])).toEqual([]);
  });

  it('tells two spellings of one tag apart from two tags', () => {
    expect(sameTag('Bad movie', 'BAD MOVIE')).toBe(true);
    expect(sameTag('Bad movie', 'Bad movies')).toBe(false);
  });
});

describe('tidyTag', () => {
  it('trims, keeps one space between words, and cuts at 30 characters', () => {
    expect(tidyTag('  Bad   movie \n')).toBe('Bad movie');
    expect(tidyTag('   ')).toBe('');
    expect(tidyTag('x'.repeat(40))).toBe('x'.repeat(MAX_TAG_LENGTH));
    // Cut, then trimmed again, so no tag ends in a space.
    expect(tidyTag(`${'a'.repeat(29)} b`)).toBe('a'.repeat(29));
    expect(tidyTag('סרט  רע')).toBe('סרט רע');
  });
});

describe('withTag', () => {
  const known = ['Bad movie', 'Christmas'];

  it('adds a new tag, tidied', () => {
    expect(withTag([], '  Cult  classic ', known)).toEqual(['Cult classic']);
  });

  it("spells a known tag the family's way", () => {
    expect(withTag(['Christmas'], 'BAD MOVIE', known)).toEqual(['Christmas', 'Bad movie']);
  });

  it('changes nothing for an empty tag, one already there in any case, or a full show', () => {
    const tags = ['Bad movie'];
    expect(withTag(tags, '  ', known)).toBe(tags);
    expect(withTag(tags, 'bad movie', known)).toBe(tags);
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `T${i}`);
    expect(withTag(full, 'One more', known)).toBe(full);
  });
});
```

In `describe('parseShowView', …)`:
  - In `it('keeps a valid stored view', …)`, change the first expectation to `.toEqual({ status: 'watched', kind: 'series', genres: [], tags: [], sort: 'rating' })` and add:
    `expect(parseShowView({ status: 'all', kind: 'all', tags: ['Bad movie', 'סרט רע'], sort: 'added' }).tags).toEqual(['Bad movie', 'סרט רע']);`
  - In `it('falls back field by field for junk', …)`, add:

```ts
    // Views saved before tags had none.
    expect(parseShowView({ status: 'all', kind: 'all', sort: 'added' }).tags).toEqual([]);
    expect(parseShowView({ tags: 'Bad movie' }).tags).toEqual([]);
    expect(parseShowView({ tags: ['Bad movie', 3, '', ' ', null, 'Bad movie', 'Christmas'] }).tags).toEqual(['Bad movie', 'Christmas']);
    expect(parseShowView({ tags: Array.from({ length: 25 }, (_, i) => `T${i}`) }).tags).toHaveLength(MAX_TAGS);
```

In `describe('refreshPatch', …)`:
  - In `it("updates the fetched fields and fetchedAt, and keeps status, watchedAt and the star", …)`, change the `watched` line to `const watched = { ...breakingBad, status: 'watched' as const, watchedAt: '2026-09-01T20:00:00.000Z', favorite: true, tags: ['Bad movie'] };` and add `expect(after.tags).toEqual(['Bad movie']);` after `expect(after.favorite).toBe(true);`.
  - In `it('writes exactly the refreshed fields, never status, watchedAt, the star or who added it', …)`, add `'tags'` to the list of keys in the `for` loop.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/domain/shows.test.ts` → fails: the new imports are not exported.

- [ ] **Step 3: Implement.** In `src/domain/shows.ts`:

Replace the `ShowView` interface, `DEFAULT_SHOW_VIEW`, `MAX_GENRE_FILTER` and `parseShowView()` with:

```ts
/** The filter and sort a device remembers. The name search is not kept. */
export interface ShowView {
  status: StatusFilter;
  kind: KindFilter;
  /** Genres a show must all have, as stored (in English). Empty: no genre filter. */
  genres: string[];
  /** Tags a show must all have, as typed. Empty: no tag filter. */
  tags: string[];
  sort: ShowSort;
}

export const DEFAULT_SHOW_VIEW: ShowView = { status: 'all', kind: 'all', genres: [], tags: [], sort: 'added' };

/** More genres than a show can have (ten) would match nothing. */
const MAX_GENRE_FILTER = 10;

/** Tags one show can have; the backend's check allows no more. */
export const MAX_TAGS = 20;

/** Characters in one tag. */
export const MAX_TAG_LENGTH = 30;

/** Rebuilds a view from a stored preference, ignoring anything malformed. */
export function parseShowView(raw: unknown): ShowView {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SHOW_VIEW;
  const { status, kind, genres, tags, sort } = raw as Record<string, unknown>;
  return {
    status: status === 'all' || SHOW_STATUSES.includes(status as ShowStatus) ? (status as StatusFilter) : DEFAULT_SHOW_VIEW.status,
    kind: kind === 'all' || kind === 'movie' || kind === 'series' ? kind : DEFAULT_SHOW_VIEW.kind,
    genres: storedNames(genres, MAX_GENRE_FILTER),
    tags: storedNames(tags, MAX_TAGS),
    sort: SHOW_SORTS.includes(sort as ShowSort) ? (sort as ShowSort) : DEFAULT_SHOW_VIEW.sort,
  };
}

/** A stored list of names: strings with something in them, each once, at most `max`. Anything else is none. */
function storedNames(raw: unknown, max: number): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((item): item is string => typeof item === 'string' && item.trim() !== ''))].slice(0, max) : [];
}
```

Replace the `ShowFilter` interface, `genreStarts()` and `filterShows()` with:

```ts
export interface ShowFilter {
  /**
   * Words, each found in the title, among the genres or among the tags,
   * whatever the case: "action comedy" finds shows with both genres, "batman
   * action" an action show with Batman in its title, "bad" a show tagged Bad
   * movie. A word finds a genre or a tag by the start of one of its words
   * ("sci" and "fi" find Sci-Fi, "man" never finds Romance), and a title
   * anywhere in it.
   */
  query: string;
  /** `all` is every show the family still means to watch or has: dropped ones only show under `dropped`. */
  status: StatusFilter;
  kind: KindFilter;
  /** Genres a show must all have: Action and Comedy is action comedies. */
  genres?: readonly string[];
  /** Tags a show must all have, whatever the case: Bad movie and Christmas is bad Christmas movies. */
  tags?: readonly string[];
  /** What else the search finds a genre by, such as its name in the screen's language. */
  genreName?: (genre: string) => string;
}

/** Lower case, without spaces or hyphens: "Sci-Fi" is "scifi", so "sci-fi" and "scifi" both find it. */
function folded(text: string): string {
  return text.toLocaleLowerCase().replace(/[\s-]+/g, '');
}

/** What a search word must start: each word of each text, and each text run together. */
function wordStarts(texts: readonly string[]): string[] {
  const starts: string[] = [];
  for (const text of texts) starts.push(...text.toLocaleLowerCase().split(/[\s-]+/), folded(text));
  return starts.filter((start) => start !== '');
}

/** `compute` worked out once per key: a list repeats the same few genres and tags. */
function once(compute: (key: string) => string[]): (key: string) => string[] {
  const found = new Map<string, string[]>();
  return (key) => {
    let value = found.get(key);
    if (value === undefined) {
      value = compute(key);
      found.set(key, value);
    }
    return value;
  };
}

export function filterShows(shows: readonly Show[], filter: ShowFilter): Show[] {
  const words = filter.query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => ({ word, folded: folded(word) }));
  const wanted = filter.genres ?? [];
  const wantedTags = filter.tags ?? [];
  const genreStarts = once((genre) => wordStarts(filter.genreName === undefined ? [genre] : [genre, filter.genreName(genre)]));
  const tagStarts = once((tag) => wordStarts([tag]));
  return shows.filter((show) => {
    if (filter.status === 'all' ? show.status === 'dropped' : show.status !== filter.status) return false;
    if (filter.kind !== 'all' && show.kind !== filter.kind) return false;
    const genres = show.genres ?? [];
    if (!wanted.every((genre) => genres.includes(genre))) return false;
    if (!hasTags(show, wantedTags)) return false;
    if (words.length === 0) return true;
    const title = show.title.toLocaleLowerCase();
    const tags = show.tags ?? [];
    return words.every(
      ({ word, folded: key }) =>
        title.includes(word) ||
        (key !== '' &&
          (genres.some((genre) => genreStarts(genre).some((start) => start.startsWith(key))) ||
            tags.some((tag) => tagStarts(tag).some((start) => start.startsWith(key))))),
    );
  });
}
```

After `lacksGenres()`, add:

```ts
const tagKey = (tag: string): string => tag.toLocaleLowerCase();

/** One tag, however each is capitalised: "Bad movie" and "bad movie". */
export function sameTag(a: string, b: string): boolean {
  return tagKey(a) === tagKey(b);
}

/** A typed tag as it is saved: trimmed, one space between words, at most MAX_TAG_LENGTH characters. Empty: no tag. */
export function tidyTag(text: string): string {
  return Array.from(text.trim().replace(/\s+/g, ' ')).slice(0, MAX_TAG_LENGTH).join('').trimEnd();
}

/**
 * A show's tags with one more: `typed` tidied, spelled as the family already
 * spells it when `known` has it in any case ("bad movie" saves as "Bad
 * movie"). The same array back when the tag is empty, the show already has
 * it in any case, or the show has MAX_TAGS.
 */
export function withTag(tags: readonly string[], typed: string, known: readonly string[]): readonly string[] {
  const tidy = tidyTag(typed);
  if (tidy === '' || tags.length >= MAX_TAGS || tags.some((tag) => sameTag(tag, tidy))) return tags;
  return [...tags, known.find((tag) => sameTag(tag, tidy)) ?? tidy];
}

/** Whether a show has every one of `tags`, whatever the case. */
export function hasTags(show: Show, tags: readonly string[]): boolean {
  if (tags.length === 0) return true;
  const own = (show.tags ?? []).map(tagKey);
  return tags.every((tag) => own.includes(tagKey(tag)));
}

/**
 * Each tag among these shows, with how many have it. Spellings that differ
 * only in case count as one tag, spelled as first met.
 */
export function tagCounts(shows: readonly Show[]): Map<string, number> {
  const spelling = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const show of shows) {
    for (const tag of show.tags ?? []) {
      const name = spelling.get(tagKey(tag)) ?? tag;
      spelling.set(tagKey(tag), name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/** Every tag the family uses, each once, spelled as first met. Screens sort it. */
export function familyTags(shows: readonly Show[]): string[] {
  return [...tagCounts(shows).keys()];
}
```

- [ ] **Step 4: Run them to see them pass.** `npx vitest run src/domain/shows.test.ts` → all pass. Then `npx tsc --noEmit` → no errors (Shows.tsx still compiles: `set()` takes a `Partial<ShowView>`).

- [ ] **Step 5: Docs.** In `src/domain/README.md`:
  - In the `shows.ts` row, replace `\`filterShows()\` (All leaves dropped shows out; every genre picked; search words in the title or the genres), \`genreCounts()\`,` with `\`filterShows()\` (All leaves dropped shows out; every genre and tag picked; search words in the title, the genres or the tags), \`genreCounts()\`, the tag rules (\`MAX_TAGS\` 20, \`MAX_TAG_LENGTH\` 30, \`sameTag()\`, \`tidyTag()\`, \`withTag()\`, \`hasTags()\`, \`tagCounts()\`, \`familyTags()\`),` and replace `(the stored filters, genres included, and sort)` with `(the stored filters, genres and tags included, and sort)`.
  - After the bullet that starts `- A refresh writes every field in \`REFRESHED_FIELDS\``, add:
    `- Tags are the family's own, kept as typed and never translated. Spellings that differ only in case are one tag: \`withTag()\` saves a typed tag in the spelling the family already uses, the tag filter (\`hasTags()\`) and \`tagCounts()\` ignore case, and \`familyTags()\` lists each once, spelled as first met. The search finds a tag as it finds a genre, by the start of one of its words. A refresh never writes \`tags\`: it is not in \`REFRESHED_FIELDS\`.`
  - In the Tests paragraph, replace `the stored view with junk,` with `the stored view with junk, tags included; tags picked whatever the case and with genres, tags found in the search by the start of a word, tag counts and the family's tags with case folded, \`tidyTag()\` and \`withTag()\`;` and replace `keeps \`status\`, \`watchedAt\` and the star,` with `keeps \`status\`, \`watchedAt\`, the star and the tags,`.

- [ ] **Step 6: Commit.**

```bash
git add src/domain/shows.ts src/domain/shows.test.ts src/domain/README.md
git commit -m "Shows: the rules for a tag, the tag filter and tags in the search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Saving a show's tags

**Files:**
- Modify: `src/features/activities/shows/actions.ts`
- Test: `src/features/activities/shows/actions.test.ts`

**Interfaces:**
- Consumes: `Show.tags` (Task 1).
- Produces: `setTags(store: DataStore, show: Show, tags: readonly string[]): Promise<Show>` (used by Task 7).

- [ ] **Step 1: Write the failing tests.** In `src/features/activities/shows/actions.test.ts`, add `setTags` to the import from `./actions`, and at the end of the file add:

```ts
describe('setTags', () => {
  it('saves the tags, and an empty list once the last is off', async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    expect((await setTags(store, show, ['Bad movie', 'Christmas'])).tags).toEqual(['Bad movie', 'Christmas']);
    expect((await store.shows.list())[0]?.tags).toEqual(['Bad movie', 'Christmas']);
    expect((await setTags(store, show, [])).tags).toEqual([]);
    expect((await store.shows.list())[0]?.tags).toEqual([]);
  });

  it('keeps the tags through a status change, a drop and a restore, starring and a refresh', async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    let tagged = await setTags(store, show, ['Bad movie']);
    tagged = await cycleStatus(store, tagged);
    tagged = await restoreShow(store, await dropShow(store, tagged));
    tagged = await toggleFavorite(store, tagged);
    expect(tagged.tags).toEqual(['Bad movie']);
    const lookup = vi.fn<typeof lookupShow>(async () => ({ ok: true, value: { ...INCEPTION, imdbRating: 8.9 } }));
    const refreshed = await refreshShow(store, tagged, lookup);
    expect(refreshed.ok && refreshed.show.tags).toEqual(['Bad movie']);
    expect(refreshed.ok && refreshed.show.favorite).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/features/activities/shows/actions.test.ts` → fails: `setTags` is not exported.

- [ ] **Step 3: Implement.** In `src/features/activities/shows/actions.ts`, after `toggleFavorite()`, add:

```ts
/**
 * Saves a show's tags, for the whole family. Removing the last writes [],
 * never a cleared field: the backend's column is not null.
 */
export async function setTags(store: DataStore, show: Show, tags: readonly string[]): Promise<Show> {
  return store.shows.update(show.id, { tags: [...tags] });
}
```

- [ ] **Step 4: Run them to see them pass.** `npx vitest run src/features/activities/shows/actions.test.ts` → all pass.

- [ ] **Step 5: Commit.**

```bash
git add src/features/activities/shows/actions.ts src/features/activities/shows/actions.test.ts
git commit -m "Shows: setTags() saves a show's tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One filter control for genres and tags

`GenrePicker` becomes `ChipFilter`, which takes its words and how to name an option. Genres keep working exactly as before, with a new icon (`Drama`, theatre masks), so the Tags control (`Tag`) is told apart. The Clear, Show N shows and option strings move from `shows.genres` to a shared `shows.filter`.

**Files:**
- Rename: `src/features/activities/shows/GenrePicker.tsx` → `ChipFilter.tsx`, `GenrePicker.module.css` → `ChipFilter.module.css` (with `git mv`)
- Modify: `src/features/activities/shows/Shows.tsx`
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/he.json`
- Test: `src/features/activities/shows/Shows.test.tsx` (existing genre cases, keys renamed)
- Docs: `src/components/README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 5):

```ts
export function ChipFilter(props: {
  label: string;                                  // control name and sheet title
  icon: LucideIcon;
  hint: string;                                   // under the sheet title
  empty: string;                                  // when nothing can be picked
  picked: readonly string[];
  counts: ReadonlyMap<string, number>;
  listed: number;
  name: (option: string) => string;               // an option's name on screen
  pickedLabel: (names: string) => string;         // screen-reader label for what is picked
  onChange: (picked: string[]) => void;
  shape: 'button' | 'chip';
  className?: string;
}): JSX.Element
```

- Locale keys: `shows.filter.option` (`{{name}} {{count, number}}`), `shows.filter.clear`, `shows.filter.done_*`.

- [ ] **Step 1: Point the existing tests at the shared keys.** In `src/features/activities/shows/Shows.test.tsx`, replace every `i18n.t('shows.genres.done', …)` with `i18n.t('shows.filter.done', …)` and `i18n.t('shows.genres.clear')` with `i18n.t('shows.filter.clear')`.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/features/activities/shows/Shows.test.tsx` → the genre sheet case fails (the keys do not exist, so `t()` returns the key and no button matches). `npx tsc --noEmit` also fails on the unknown keys.

- [ ] **Step 3: Move the strings.** In `src/i18n/locales/en.json`, inside `"shows"`, delete `"option"`, `"clear"`, `"done_one"` and `"done_other"` from `"genres"`, and add before `"genres": {`:

```json
    "filter": {
      "option": "{{name}} {{count, number}}",
      "clear": "Clear",
      "done_one": "Show {{count, number}} show",
      "done_other": "Show {{count, number}} shows"
    },
```

In `src/i18n/locales/he.json`, delete `"option"`, `"clear"`, `"done_one"`, `"done_two"` and `"done_other"` from `"shows"."genres"`, and add before its `"genres": {`:

```json
    "filter": {
      "option": "{{name}} {{count, number}}",
      "clear": "ניקוי",
      "done_one": "להציג כותר אחד",
      "done_two": "להציג שני כותרים",
      "done_other": "להציג {{count, number}} כותרים"
    },
```

- [ ] **Step 4: Rename and generalise the control.**

```bash
git mv src/features/activities/shows/GenrePicker.tsx src/features/activities/shows/ChipFilter.tsx
git mv src/features/activities/shows/GenrePicker.module.css src/features/activities/shows/ChipFilter.module.css
```

Replace the whole of `src/features/activities/shows/ChipFilter.tsx` with:

```tsx
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Sheet, cx } from '../../../components/ui';
import { formatList } from '../../../i18n';
import s from './ChipFilter.module.css';

/**
 * A filter of names a show must all have (genres, tags): a button that names
 * those picked ("Action and Comedy"), and a sheet to pick them. The sheet
 * offers only names that still leave something to show: each with how many
 * of the shows listed now have it, which is what picking it would list.
 * Picked names stay offered, so they can always be taken off.
 */
export function ChipFilter({
  label,
  icon: Icon,
  hint,
  empty,
  picked,
  counts,
  listed,
  name,
  pickedLabel,
  onChange,
  shape,
  className,
}: {
  /** The control's name and the sheet's title ("Genres"). */
  label: string;
  icon: LucideIcon;
  /** Under the sheet's title: how picking works. */
  hint: string;
  /** In the sheet when nothing can be picked. */
  empty: string;
  /** Names picked, as stored. */
  picked: readonly string[];
  /** Each name among the shows listed now, with how many have it. */
  counts: ReadonlyMap<string, number>;
  /** How many shows are listed now. */
  listed: number;
  /** A name as the screen shows it: a genre translated, a tag as typed. */
  name: (option: string) => string;
  /** The screen-reader label for what is picked, given their names as a list ("Genres: Action and Comedy"). */
  pickedLabel: (names: string) => string;
  onChange: (picked: string[]) => void;
  shape: 'button' | 'chip';
  className?: string;
}): JSX.Element {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base' }), [i18n.language]);
  const options = useMemo(
    () =>
      [...new Set([...picked, ...counts.keys()])]
        .map((option) => ({ option, label: name(option) }))
        .sort((a, b) => collator.compare(a.label, b.label)),
    [picked, counts, name, collator],
  );
  const toggle = (option: string): void => onChange(picked.includes(option) ? picked.filter((item) => item !== option) : [...picked, option]);

  // Picked, the button shows only their names; a screen reader also hears what they are.
  const names = formatList(picked.map(name));
  const text =
    picked.length === 0 ? (
      <span className={s.text}>{label}</span>
    ) : (
      <>
        <span className={s.text} aria-hidden>
          {names}
        </span>
        <span className="visually-hidden">{pickedLabel(names)}</span>
      </>
    );

  return (
    <>
      {shape === 'chip' ? (
        <Chip icon={Icon} selected={picked.length > 0} onClick={() => setOpen(true)} className={cx(s.chip, className)}>
          {text}
        </Chip>
      ) : (
        <button type="button" className={cx(s.button, picked.length > 0 && s.buttonOn, className)} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon size={18} strokeWidth={2} aria-hidden />
          {text}
          <ChevronDown size={18} strokeWidth={2} aria-hidden className={s.chevron} />
        </button>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <div className={s.footer}>
            <Button variant="ghost" disabled={picked.length === 0} onClick={() => onChange([])}>
              {t('shows.filter.clear')}
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              {t('shows.filter.done', { count: listed })}
            </Button>
          </div>
        }
      >
        <p className={s.hint}>{hint}</p>
        {options.length === 0 ? (
          <p className={s.hint}>{empty}</p>
        ) : (
          <div className={s.options} role="group" aria-label={label}>
            {options.map(({ option, label: optionName }) => (
              <Chip key={option} selected={picked.includes(option)} onClick={() => toggle(option)}>
                {t('shows.filter.option', { name: optionName, count: counts.get(option) ?? 0 })}
              </Chip>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
```

In `ChipFilter.module.css`, change the first comment's opening line from `Both shapes hold the screen-reader label for the genres picked, which is` to `Both shapes hold the screen-reader label for what is picked, which is`, and the comment above `.buttonOn` from `/* Genres picked: dark, like a chosen chip or segment. */` to `/* Something picked: dark, like a chosen chip or segment. */`. Nothing else changes.

- [ ] **Step 5: Use it for genres.** In `src/features/activities/shows/Shows.tsx`:
  - Change the lucide import to `import { ArrowUpDown, Clapperboard, Drama, Plus, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';`
  - Replace `import { GenrePicker } from './GenrePicker';` with `import { ChipFilter } from './ChipFilter';`
  - Replace the `genrePicker` function with:

```tsx
  const genreFilter = (shape: 'button' | 'chip'): JSX.Element => (
    <ChipFilter
      shape={shape}
      label={t('shows.genres.label')}
      icon={Drama}
      hint={t('shows.genres.hint')}
      empty={t('shows.genres.none')}
      picked={view.genres}
      counts={genreCounts(shown)}
      listed={shown.length}
      name={genreName}
      pickedLabel={(genres) => t('shows.genres.picked', { genres })}
      onChange={(genres) => set({ genres })}
    />
  );
```

  - Replace `{genrePicker('button')}` with `{genreFilter('button')}` and `{genrePicker('chip')}` with `{genreFilter('chip')}`.

- [ ] **Step 6: Run the tests to see them pass.** `npx vitest run src/features/activities/shows src/i18n` → all pass. `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Docs.** In `src/components/README.md`, replace `(\`../features/activities/shows/GenrePicker.module.css\`)` with `(\`../features/activities/shows/ChipFilter.module.css\`)`. (The activities README is rewritten in Task 8.)

- [ ] **Step 8: Commit.**

```bash
git add src/features/activities/shows/ChipFilter.tsx src/features/activities/shows/ChipFilter.module.css src/features/activities/shows/GenrePicker.tsx src/features/activities/shows/GenrePicker.module.css src/features/activities/shows/Shows.tsx src/features/activities/shows/Shows.test.tsx src/i18n/locales/en.json src/i18n/locales/he.json src/components/README.md
git commit -m "Shows: one chip filter for genres and the coming tags; genres get the theatre masks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Tags filter on the page

**Files:**
- Modify: `src/features/activities/shows/Shows.tsx`
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/he.json`
- Test: `src/features/activities/shows/Shows.test.tsx`

**Interfaces:**
- Consumes: `ChipFilter` (Task 4); `tagCounts()`, `hasTags()`, `ShowView.tags`, `ShowFilter.tags` (Task 2).
- Produces: locale keys `shows.tags.label`, `shows.tags.picked`, `shows.tags.filterHint`, `shows.tags.none`. Module-level test helpers in `Shows.test.tsx`: `titles`, `sheet`, `chip`, `type` (Tasks 6 and 7 use them).

- [ ] **Step 1: Share the test helpers.** In `src/features/activities/shows/Shows.test.tsx`, move `titles`, `sheet`, `chip` and `type` out of `describe('genres', …)` to module level, just after the `button` helper, unchanged.

- [ ] **Step 2: Write the failing tests.** At the end of `Shows.test.tsx`, add:

```tsx
describe('tags', () => {
  // Added in reverse A to Z, so newest first and A to Z (the tie-break when two share a millisecond) agree.
  const SHELF: [string, string[]][] = [
    ['Sharknado', ['Bad movie', 'Movie night']],
    ['Santa Claus Conquers the Martians', ['Bad movie', 'Christmas']],
    ['Inception', []],
    ['Elf', ['Christmas']],
  ];

  async function addShelf(): Promise<void> {
    for (const [i, [title, tags]] of SHELF.entries()) {
      await store.shows.create({ imdbId: `tt${String(4000000 + i)}`, kind: 'movie', title, fetchedAt: '2026-10-04T08:00:00.000Z', status: 'to-watch', tags });
    }
  }

  it('has no Tags control until a show has a tag', async () => {
    await addShows(3);
    const host = await render();
    expect(button(host, i18n.t('shows.tags.label'))).toBeUndefined();
  });

  it('keeps only shows with every tag picked, and the status counts follow', async () => {
    await addShelf();
    const host = await render();
    await act(async () => button(host, i18n.t('shows.tags.label'))?.click());
    const picker = sheet() as HTMLDialogElement;
    expect([...picker.querySelectorAll('[role="group"] button')].map((b) => b.textContent)).toEqual(['Bad movie 2', 'Christmas 2', 'Movie night 1']);

    await act(async () => chip(picker, 'Bad movie 2')?.click());
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians', 'Sharknado']);
    await act(async () => chip(picker, 'Christmas 1')?.click());
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians']);
    await act(async () => button(picker, i18n.t('shows.filter.done', { count: 1 }))?.click());
    expect(sheet()).toBeNull();
    expect(host.textContent).toContain('Bad movie and Christmas');
    expect(button(host, i18n.t('shows.all', { count: 1 }))).toBeDefined();

    await act(async () => button(host, 'Bad movie and Christmas')?.click());
    await act(async () => button(sheet() as HTMLDialogElement, i18n.t('shows.filter.clear'))?.click());
    expect(cards(host)).toHaveLength(4);
  });

  it('are cleared by Show all', async () => {
    await addShelf();
    const host = await render();
    await act(async () => button(host, i18n.t('shows.tags.label'))?.click());
    await act(async () => chip(sheet() as HTMLDialogElement, 'Christmas 2')?.click());
    await act(async () => button(sheet() as HTMLDialogElement, i18n.t('shows.filter.done', { count: 2 }))?.click());
    await type(host, 'sharknado');
    expect(cards(host)).toHaveLength(0);
    await act(async () => button(host, i18n.t('shows.showAll'))?.click());
    expect(cards(host)).toHaveLength(4);
    expect(button(host, i18n.t('shows.tags.label'))).toBeDefined();
  });

  it('finds a tag typed in the search, by the start of its words', async () => {
    await addShelf();
    const host = await render();
    await type(host, 'bad');
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians', 'Sharknado']);
    await type(host, 'christmas bad');
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians']);
    await type(host, 'ovie');
    expect(cards(host)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run them to see them fail.** `npx vitest run src/features/activities/shows/Shows.test.tsx` → the new cases fail (no Tags control; the search does find tags already, from Task 2, so that case may pass).

- [ ] **Step 4: Add the strings.** In `en.json`, inside `"shows"`, after the `"genre"` object, add:

```json
    "tags": {
      "label": "Tags",
      "picked": "Tags: {{tags}}",
      "filterHint": "Shows with every tag you pick.",
      "none": "None of the shows listed has a tag."
    },
```

In `he.json`, in the same place:

```json
    "tags": {
      "label": "תגיות",
      "picked": "תגיות: {{tags}}",
      "filterHint": "כותרים עם כל התגיות שבחרתם.",
      "none": "לאף אחד מהכותרים ברשימה אין תגית."
    },
```

- [ ] **Step 5: Implement.** In `src/features/activities/shows/Shows.tsx`:
  - Lucide import: add `Tag as TagIcon`.
  - Domain import: add `hasTags` and `tagCounts`.
  - Replace `keyOf` with:

```tsx
const keyOf = (query: string, view: ShowView): string =>
  [query, view.status, view.kind, view.genres.join('\u0001'), view.tags.join('\u0001'), view.sort].join('\u0000');

/** A tag's name on screen: as typed. */
const asTyped = (tag: string): string => tag;
```

  - In `showAll`, change `set({ status: 'all', kind: 'all', genres: [] });` to `set({ status: 'all', kind: 'all', genres: [], tags: [] });`
  - Change the `shown` line to pass the tags:

```tsx
  const shown = sortShows(
    filterShows(rows, { query: listQuery, status: view.status, kind: view.kind, genres: view.genres, tags: view.tags, genreName }),
    view.sort,
    collator.compare,
  );
```

  - Replace the `ofKind` comment and line with:

```tsx
  // Counts follow the kind, genre and tag filters, so "To watch 3" means three of what is listed; All leaves dropped shows out, as its list does.
  const ofKind = rows.filter(
    (row) => (view.kind === 'all' || row.kind === view.kind) && view.genres.every((genre) => row.genres?.includes(genre) === true) && hasTags(row, view.tags),
  );
```

  - In `reveal()`, pass `tags: view.tags` to the `filterShows` call, change `set({ status, kind: 'all', genres: [] });` to `set({ status, kind: 'all', genres: [], tags: [] });`, and in the `setPaging` call change `{ ...view, status, kind: 'all', genres: [] }` to `{ ...view, status, kind: 'all', genres: [], tags: [] }`.
  - After `genreFilter`, add:

```tsx
  // Shown once any show has a tag, or while one is picked, so a tag picked on an earlier visit can come off.
  const anyTags = view.tags.length > 0 || rows.some((row) => (row.tags?.length ?? 0) > 0);
  const tagFilter = (shape: 'button' | 'chip'): JSX.Element | null =>
    anyTags ? (
      <ChipFilter
        shape={shape}
        label={t('shows.tags.label')}
        icon={TagIcon}
        hint={t('shows.tags.filterHint')}
        empty={t('shows.tags.none')}
        picked={view.tags}
        counts={tagCounts(shown)}
        listed={shown.length}
        name={asTyped}
        pickedLabel={(tags) => t('shows.tags.picked', { tags })}
        onChange={(tags) => set({ tags })}
      />
    ) : null;
```

  - Put `{tagFilter('button')}` right after `{genreFilter('button')}`, and `{tagFilter('chip')}` right after `{genreFilter('chip')}`.
  - Update the comment above `VIEW_PREFERENCE` to `/** The status, kind, genre and tag filters and the sort, remembered per family on this device. */`.

- [ ] **Step 6: Run the tests to see them pass.** `npx vitest run src/features/activities/shows src/i18n` → all pass. `npx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit.**

```bash
git add src/features/activities/shows/Shows.tsx src/features/activities/shows/Shows.test.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Shows: a Tags filter beside Genres

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tag chips on the card

**Files:**
- Note: Task 7 adds a second card callback, `onEditTags`, with the button that uses it.
- Modify: `src/features/activities/shows/ShowCard.tsx`, `ShowCard.module.css`
- Modify: `src/features/activities/shows/Shows.tsx`
- Modify: `src/styles/tokens.css`
- Modify: `src/i18n/locales/en.json`, `he.json`
- Test: `src/features/activities/shows/ShowCard.test.tsx`, `Shows.test.tsx`

**Interfaces:**
- Consumes: `view.tags` and `setView` in `Shows.tsx` (Task 5).
- Produces:
  - `export function Tags({ tags, onTag }: { tags: readonly string[] | undefined; onTag: (tag: string) => void }): JSX.Element | null`
  - `ShowCard` props: `{ show: Show; revealed?: number; onTag: (tag: string) => void }` (Task 7 adds `onEditTags`).
  - Locale key `shows.tags.filterBy`.
  - Tokens `--tag-tint`, `--tag-ink`.

- [ ] **Step 1: Write the failing card tests.** In `src/features/activities/shows/ShowCard.test.tsx`:
  - Change the import to `import { Facts, Genres, ShowCard, Tags, sameShow } from './ShowCard';`
  - Add after the imports: `const noop = (): void => undefined;`
  - In both existing `ShowCard` renders, change `<ShowCard show={show} />` to `<ShowCard show={show} onTag={noop} />`.
  - In `describe('sameShow', …)`, add:

```ts
  it('compares tags item by item too', () => {
    const tagged = { ...show, tags: ['Bad movie'] };
    expect(sameShow(tagged, { ...tagged, tags: ['Bad movie'] })).toBe(true);
    expect(sameShow(tagged, { ...tagged, tags: ['Bad movie', 'Christmas'] })).toBe(false);
    expect(sameShow(tagged, { ...tagged, tags: [] })).toBe(false);
    expect(sameShow({ ...show, tags: [] }, show)).toBe(false);
  });
```

  - After `describe('Genres', …)`, add:

```tsx
describe('Tags', () => {
  function tags(list: string[] | undefined, onTag: (tag: string) => void = noop): HTMLElement {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<Tags tags={list} onTag={onTag} />));
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    return host;
  }

  it('draws a chip per tag, as typed, each named for what it does', () => {
    const host = tags(['Bad movie', 'סרט רע']);
    const chips = [...host.querySelectorAll('button')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['Bad movie', 'סרט רע']);
    expect(chips[0]?.getAttribute('aria-label')).toBe('Show only shows tagged Bad movie');
    expect(host.querySelector('[role="list"]')?.children).toHaveLength(2);
  });

  it('asks for the filter when pressed', () => {
    const pressed: string[] = [];
    const host = tags(['Bad movie', 'Christmas'], (tag) => pressed.push(tag));
    act(() => [...host.querySelectorAll('button')][1]?.click());
    expect(pressed).toEqual(['Christmas']);
  });

  it('draws nothing without tags', () => {
    expect(tags(undefined).innerHTML).toBe('');
    unmount?.();
    expect(tags([]).innerHTML).toBe('');
  });
});
```

- [ ] **Step 2: Write the failing page test.** In `Shows.test.tsx`, inside `describe('tags', …)`, add:

```tsx
  it('filters by a tag pressed on a card, and goes back up to the filters', async () => {
    await addShelf();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const host = await render();
    const elf = cards(host).find((card) => card.textContent?.includes('Elf'));
    const label = i18n.t('shows.tags.filterBy', { tag: 'Christmas' });
    await act(async () => elf?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click());
    expect(titles(host)).toEqual(['Elf', 'Santa Claus Conquers the Martians']);
    // The Tags control names it (its screen-reader label; the cards' chips say only "Christmas").
    expect(host.textContent).toContain(i18n.t('shows.tags.picked', { tags: 'Christmas' }));
    expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    // A tag already picked changes nothing.
    await act(async () => elf?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click());
    expect(titles(host)).toEqual(['Elf', 'Santa Claus Conquers the Martians']);
  });
```

  In the file's `afterEach`, add `delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;` so the stub does not leak (jsdom has no `scrollIntoView`).

- [ ] **Step 3: Run them to see them fail.** `npx vitest run src/features/activities/shows` → fails: `Tags` is not exported and `ShowCard` has no `onTag`.

- [ ] **Step 4: Add the colour tokens.** In `src/styles/tokens.css`, in `:root`, after `--star-empty: #d8cbb6;`, add:

```css
  /* The family's own tags on a show (Shows cards): ink 6.6:1 on the tint. */
  --tag-tint: #ece2ee;
  --tag-ink: #6a3d73;
```

In `:root[data-theme='dark']`, after `--star-empty: #3b4551;`, add:

```css
  --tag-tint: #443249;
  --tag-ink: #e3c6ea;
```

(Dark ink on tint is 7.5:1.)

- [ ] **Step 5: Add the string.** In `en.json` `"shows"."tags"`, add `"filterBy": "Show only shows tagged {{tag}}"`. In `he.json` `"shows"."tags"`, add `"filterBy": "להציג רק כותרים עם התגית {{tag}}"`.

- [ ] **Step 6: Implement the chips.** In `src/features/activities/shows/ShowCard.tsx`:
  - Lucide import: add `Tag as TagIcon`.
  - After the `Genres` function, add:

```tsx
/**
 * The family's tags, under the genres; nothing when there are none. Each is a
 * button that adds its tag to the page's filter (`onTag`). Tags show as typed.
 */
export function Tags({ tags, onTag }: { tags: readonly string[] | undefined; onTag: (tag: string) => void }): JSX.Element | null {
  const { t } = useTranslation();
  if (tags === undefined || tags.length === 0) return null;
  return (
    // role="list" because list-style: none drops the list's role in Safari.
    <ul className={s.tags} role="list">
      {tags.map((tag) => (
        <li key={tag}>
          <button type="button" className={s.tag} aria-label={t('shows.tags.filterBy', { tag })} onClick={() => onTag(tag)}>
            <TagIcon size={13} strokeWidth={2.2} aria-hidden />
            <bdi>{tag}</bdi>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

  - Replace `sameShow()`'s comment and body with:

```tsx
/**
 * The same show, field by field. A re-read hands every row back as a new
 * object, so identity alone would re-render every card after any write. The
 * fields are plain values, bar genres and tags, lists compared item by item.
 */
export function sameShow(a: Show, b: Show): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof Show)[];
  return keys.length === Object.keys(b).length && keys.every((key) => (key === 'genres' || key === 'tags' ? sameList(a[key], b[key]) : a[key] === b[key]));
}
```

  - Replace the `ShowCard` memo and the `ShowCardView` signature with:

```tsx
/**
 * One show. `revealed` changes when the page asks for this card to be shown
 * (adding a show that is already on the list): it opens, scrolls into view,
 * takes focus and flashes once. Memoised on the show's fields and the page's
 * callback, which the page keeps the same between renders, so a status change
 * or a keystroke re-renders the cards it changes, not all of them.
 */
export const ShowCard = memo(
  ShowCardView,
  (before, after) => before.revealed === after.revealed && before.onTag === after.onTag && sameShow(before.show, after.show),
);

function ShowCardView({
  show,
  revealed,
  onTag,
}: {
  show: Show;
  revealed?: number;
  /** Adds a tag to the page's filter. */
  onTag: (tag: string) => void;
}): JSX.Element {
```

  - In the JSX, after `<Genres genres={show.genres} />`, add `<Tags tags={show.tags} onTag={onTag} />`.

In `ShowCard.module.css`, after the `.genres` rule, add:

```css
/* The family's tags: chips under the genres, each a button that filters by it. */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

/*
 * 28px tall: above the 24px minimum target (WCAG 2.5.8), without a 44px
 * target's height on every tagged card.
 */
.tag {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  max-width: 100%;
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--tag-tint);
  color: var(--tag-ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.tag > bdi {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag:hover {
  box-shadow: inset 0 0 0 100px var(--hover-wash);
}

.tag:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 7: Wire the page.** In `src/features/activities/shows/Shows.tsx`, after the `genreName` callback, add:

```tsx
  // A tag pressed on a card joins the tag filter, and the page goes back up to the filters, which now name it.
  const toolbar = useRef<HTMLDivElement>(null);
  const filterByTag = useCallback((tag: string): void => {
    setView((current) => (current.tags.includes(tag) ? current : { ...current, tags: [...current.tags, tag] }));
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    toolbar.current?.scrollIntoView?.({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  }, []);
```

  - Give the toolbar the ref: `<div className={s.toolbar} role="search" ref={toolbar}>`.
  - Pass the callback to every card: `<ShowCard key={show.id} show={show} revealed={revealed?.id === show.id ? revealed.at : undefined} onTag={filterByTag} />`.

- [ ] **Step 8: Run the tests to see them pass.** `npx vitest run src/features/activities/shows src/i18n` → all pass. `npx tsc --noEmit` → no errors.

- [ ] **Step 9: Commit.**

```bash
git add src/features/activities/shows/ShowCard.tsx src/features/activities/shows/ShowCard.module.css src/features/activities/shows/ShowCard.test.tsx src/features/activities/shows/Shows.tsx src/features/activities/shows/Shows.test.tsx src/styles/tokens.css src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Shows: tags as chips on the card, each filtering the list by it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Tags sheet

**Files:**
- Create: `src/features/activities/shows/TagSheet.tsx`, `TagSheet.module.css`, `TagSheet.test.tsx`
- Modify: `src/features/activities/shows/ShowCard.tsx` (a Tags button in `Details`)
- Modify: `src/features/activities/shows/Shows.tsx` (render the sheet)
- Modify: `src/i18n/locales/en.json`, `he.json`
- Test: `TagSheet.test.tsx`, `Shows.test.tsx`, `ShowCard.test.tsx` (the new prop)

**Interfaces:**
- Consumes: `setTags()` (Task 3); `MAX_TAGS`, `MAX_TAG_LENGTH`, `familyTags()`, `sameTag()`, `tidyTag()`, `withTag()` (Task 2); `ShowCard`'s `onTag` memo (Task 6).
- Produces: `export function TagSheet({ show, shows, onClose }: { show: Show; shows: readonly Show[]; onClose: () => void }): JSX.Element`. `ShowCard` gains `onEditTags: (show: Show) => void`. Locale keys `shows.tags.edit`, `sheetTitle`, `hint`, `firstHint`, `field`, `placeholder`, `add`, `full`, `done`.

- [ ] **Step 1: Write the failing sheet tests.** Create `src/features/activities/shows/TagSheet.test.tsx`:

```tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionContext } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import { useCollectionState } from '../../../data/useCollection';
import type { Member, Show } from '../../../domain/types';
import { i18n, localeReady } from '../../../i18n';
import { TagSheet } from './TagSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alex: Member = { id: 'm1', familyId: 'f-tags', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };
let store: DataStore;
let unmount: (() => void) | null = null;

/** The sheet for one show, fed live rows as the page feeds it. */
function Harness({ id }: { id: string }): JSX.Element | null {
  const { rows } = useCollectionState(store.shows);
  const show = rows.find((row) => row.id === id);
  return show === undefined ? null : <TagSheet show={show} shows={rows} onClose={() => undefined} />;
}

async function add(title: string, tags: string[]): Promise<Show> {
  return store.shows.create({ imdbId: `tt${String(5000000 + title.length)}${title.charCodeAt(0)}`, kind: 'movie', title, fetchedAt: '2026-10-05T08:00:00.000Z', status: 'to-watch', tags });
}

async function open(show: Show): Promise<HTMLDialogElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <SessionContext.Provider value={{ store, me: alex, members: [alex], signOut: async () => {} }}>
        <Harness id={show.id} />
      </SessionContext.Provider>,
    ),
  );
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  for (let i = 0; i < 50 && document.querySelector('dialog[open]') === null; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return document.querySelector('dialog[open]') as HTMLDialogElement;
}

const chips = (sheet: HTMLElement): HTMLButtonElement[] => [...sheet.querySelectorAll<HTMLButtonElement>('[role="group"] button')];
const names = (sheet: HTMLElement): string[] => chips(sheet).map((b) => b.textContent ?? '');
const pressed = (sheet: HTMLElement): string[] => chips(sheet).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent ?? '');
const field = (sheet: HTMLElement): HTMLInputElement => sheet.querySelector('input') as HTMLInputElement;
const saved = async (id: string): Promise<string[] | undefined> => (await store.shows.list()).find((row) => row.id === id)?.tags;

async function type(sheet: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field(sheet), text);
    field(sheet).dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function enter(sheet: HTMLElement): Promise<void> {
  await act(async () => {
    sheet.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeAll(async () => {
  await localeReady;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  localStorage.clear();
  store = createLocalStore('f-tags');
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('TagSheet', () => {
  it("offers every family tag A to Z, pressed for this show's", async () => {
    await add('Sharknado', ['Movie night', 'Bad movie']);
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    expect(sheet.querySelector('h2')?.textContent).toBe('Tags for Elf');
    expect(names(sheet)).toEqual(['Bad movie', 'Christmas', 'Movie night']);
    expect(pressed(sheet)).toEqual(['Christmas']);
  });

  it('adds a new tag typed, with Enter or Add, and clears the field', async () => {
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    await type(sheet, '  Cult   classic ');
    expect(names(sheet)[0]).toBe(i18n.t('shows.tags.add', { tag: 'Cult classic' }));
    await enter(sheet);
    expect(await saved(elf.id)).toEqual(['Christmas', 'Cult classic']);
    expect(field(sheet).value).toBe('');
    expect(pressed(sheet)).toEqual(['Christmas', 'Cult classic']);

    await type(sheet, 'Feel good');
    await act(async () => chips(sheet)[0]?.click());
    expect(await saved(elf.id)).toEqual(['Christmas', 'Cult classic', 'Feel good']);
  });

  it("uses the family's spelling for a known tag typed in another case", async () => {
    await add('Sharknado', ['Bad movie']);
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    await type(sheet, 'bad MOVIE');
    // Known: no Add chip, just the match.
    expect(names(sheet)).toEqual(['Bad movie']);
    await enter(sheet);
    expect(await saved(elf.id)).toEqual(['Christmas', 'Bad movie']);
  });

  it('narrows the tags to what is typed', async () => {
    await add('Sharknado', ['Bad movie', 'Movie night']);
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    await type(sheet, 'mov');
    expect(names(sheet)).toEqual([i18n.t('shows.tags.add', { tag: 'mov' }), 'Bad movie', 'Movie night']);
  });

  it('keeps a tag taken off its last show until the sheet closes', async () => {
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    await act(async () => chips(sheet)[0]?.click());
    expect(await saved(elf.id)).toEqual([]);
    expect(names(sheet)).toEqual(['Christmas']);
    expect(pressed(sheet)).toEqual([]);
    await act(async () => chips(sheet)[0]?.click());
    expect(await saved(elf.id)).toEqual(['Christmas']);
  });

  it('stops at 20 tags', async () => {
    const full = await add('Full', Array.from({ length: 20 }, (_, i) => `T${String(i).padStart(2, '0')}`));
    const sheet = await open(full);
    expect(field(sheet).disabled).toBe(true);
    expect(sheet.textContent).toContain(i18n.t('shows.tags.full', { max: 20 }));
  });

  it('invites a first tag when the family has none', async () => {
    const elf = await add('Elf', []);
    const sheet = await open(elf);
    expect(sheet.textContent).toContain(i18n.t('shows.tags.firstHint'));
    expect(chips(sheet)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write the failing page test.** In `Shows.test.tsx`, inside `describe('tags', …)`, add:

```tsx
  it("adds a tag from a card's details, and the card shows it", async () => {
    await addShelf();
    const host = await render();
    const inception = (): HTMLElement => cards(host).find((card) => card.textContent?.includes('Inception')) as HTMLElement;
    await act(async () => inception().querySelector<HTMLButtonElement>('button[aria-expanded]')?.click());
    await act(async () => button(inception(), i18n.t('shows.tags.edit'))?.click());
    const editor = sheet() as HTMLDialogElement;
    expect(editor.querySelector('h2')?.textContent).toBe('Tags for Inception');
    await act(async () => chip(editor, 'Bad movie')?.click());
    expect(inception().querySelector(`button[aria-label="${i18n.t('shows.tags.filterBy', { tag: 'Bad movie' })}"]`)).not.toBeNull();
    await act(async () => button(editor, i18n.t('shows.tags.done'))?.click());
    expect(sheet()).toBeNull();
  });
```

- [ ] **Step 3: Run them to see them fail.** `npx vitest run src/features/activities/shows` → fails: `./TagSheet` does not exist.

- [ ] **Step 4: Add the strings.** In `en.json` `"shows"."tags"`, add:

```json
      "edit": "Tags",
      "sheetTitle": "Tags for <item/>",
      "hint": "Shared with your family. Tap to add or remove.",
      "firstHint": "Group shows your own way, like Bad movie or Christmas. Tags are shared with your family.",
      "field": "Add a tag",
      "placeholder": "Add a tag",
      "add": "Add “{{tag}}”",
      "full": "A show can have up to {{max, number}} tags.",
      "done": "Done"
```

In `he.json` `"shows"."tags"`, add:

```json
      "edit": "תגיות",
      "sheetTitle": "תגיות עבור <item/>",
      "hint": "משותפות לכל המשפחה. נגיעה מוסיפה או מסירה.",
      "firstHint": "אפשר לקבץ כותרים בדרך שלכם, כמו סרט רע או ערב סרט. התגיות משותפות לכל המשפחה.",
      "field": "הוספת תגית",
      "placeholder": "הוספת תגית",
      "add": "להוסיף את „{{tag}}”",
      "full": "אפשר עד {{max, number}} תגיות לכותר.",
      "done": "סיום"
```

- [ ] **Step 5: Implement the sheet.** Create `src/features/activities/shows/TagSheet.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Check, Plus, Tag as TagIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { Button, Chip, Sheet, TextField } from '../../../components/ui';
import { MAX_TAGS, MAX_TAG_LENGTH, familyTags, sameTag, tidyTag, withTag } from '../../../domain/shows';
import type { Show } from '../../../domain/types';
import { setTags } from './actions';
import s from './TagSheet.module.css';

/**
 * One show's tags: every tag the family uses, pressed for this show's, and a
 * field that narrows them or adds a new one (Enter, or the Add chip). Each
 * press saves at once; Done only closes. The tags offered are the family's
 * when the sheet opened plus any added since, so a tag taken off its last
 * show stays here until the sheet closes and can be put back.
 */
export function TagSheet({ show, shows, onClose }: { show: Show; shows: readonly Show[]; onClose: () => void }): JSX.Element {
  const { t, i18n } = useTranslation();
  const { store } = useSession();
  const [typed, setTyped] = useState('');
  const [offered, setOffered] = useState<string[]>(() => familyTags(shows));

  const tags = show.tags ?? [];
  const full = tags.length >= MAX_TAGS;
  const tidy = tidyTag(typed);
  const known = offered.some((tag) => sameTag(tag, tidy));
  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base', numeric: true }), [i18n.language]);
  const listed = offered.filter((tag) => tag.toLocaleLowerCase().includes(tidy.toLocaleLowerCase())).sort(collator.compare);

  const save = (next: readonly string[]): void => {
    if (next !== tags) void setTags(store, show, next).catch(() => undefined);
  };
  const toggle = (tag: string): void => save(tags.includes(tag) ? tags.filter((item) => item !== tag) : withTag(tags, tag, offered));
  const add = (): void => {
    if (tidy === '' || full) return;
    if (!known) setOffered((current) => [...current, tidy]);
    save(withTag(tags, tidy, offered));
    setTyped('');
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={<Trans i18nKey="shows.tags.sheetTitle" components={{ item: <bdi>{show.title}</bdi> }} />}
      footer={
        <div className={s.footer}>
          <Button variant="primary" onClick={onClose}>
            {t('shows.tags.done')}
          </Button>
        </div>
      }
    >
      <p className={s.hint}>{offered.length === 0 ? t('shows.tags.firstHint') : t('shows.tags.hint')}</p>
      <form
        className={s.add}
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <TextField
          label={t('shows.tags.field')}
          icon={TagIcon}
          dir="auto"
          value={typed}
          maxLength={MAX_TAG_LENGTH}
          placeholder={t('shows.tags.placeholder')}
          disabled={full}
          enterKeyHint="done"
          onChange={(event) => setTyped(event.target.value)}
        />
      </form>
      {full && <p className={s.hint}>{t('shows.tags.full', { max: MAX_TAGS })}</p>}
      {(listed.length > 0 || (tidy !== '' && !known)) && (
        <div className={s.options} role="group" aria-label={t('shows.tags.label')}>
          {tidy !== '' && !known && !full && (
            <Chip icon={Plus} onClick={add} className={s.new}>
              {t('shows.tags.add', { tag: tidy })}
            </Chip>
          )}
          {listed.map((tag) => {
            const on = tags.includes(tag);
            return (
              <Chip key={tag} selected={on} icon={on ? Check : Plus} onClick={() => toggle(tag)}>
                <bdi>{tag}</bdi>
              </Chip>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
```

Create `src/features/activities/shows/TagSheet.module.css`:

```css
.hint {
  margin: 0 0 16px;
  color: var(--ink-2);
  font-size: 14px;
}

.add {
  margin: 0 0 16px;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Add "…": a tag that does not exist yet, set apart from the family's. */
.new {
  border-color: var(--accent);
  color: var(--accent-ink);
}

.footer {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}
```

- [ ] **Step 6: The Tags button in the card's details.** In `src/features/activities/shows/ShowCard.tsx`:
  - Replace the `ShowCard` memo and the `ShowCardView` signature with:

```tsx
/**
 * One show. `revealed` changes when the page asks for this card to be shown
 * (adding a show that is already on the list): it opens, scrolls into view,
 * takes focus and flashes once. Memoised on the show's fields and the page's
 * two callbacks, which the page keeps the same between renders, so a status
 * change or a keystroke re-renders the cards it changes, not all of them.
 */
export const ShowCard = memo(
  ShowCardView,
  (before, after) => before.revealed === after.revealed && before.onTag === after.onTag && before.onEditTags === after.onEditTags && sameShow(before.show, after.show),
);

function ShowCardView({
  show,
  revealed,
  onTag,
  onEditTags,
}: {
  show: Show;
  revealed?: number;
  /** Adds a tag to the page's filter. */
  onTag: (tag: string) => void;
  /** Opens the page's Tags sheet for this show. */
  onEditTags: (show: Show) => void;
}): JSX.Element {
```

  - Change `function Details({ show }: { show: Show }): JSX.Element {` to `function Details({ show, onEditTags }: { show: Show; onEditTags: () => void }): JSX.Element {`.
  - In the `detailActions` div, before the Refresh button, add:

```tsx
          <Button variant="ghost" icon={TagIcon} onClick={onEditTags}>
            {t('shows.tags.edit')}
          </Button>
```

  - Change `{open && <Details show={show} />}` to `{open && <Details show={show} onEditTags={() => onEditTags(show)} />}`.
  - Update `Details`'s comment to: `Behind the toggle: the plot, when it was read, Tags, refresh and delete.`
  - In `src/features/activities/shows/ShowCard.test.tsx`, change both `<ShowCard show={show} onTag={noop} />` to `<ShowCard show={show} onTag={noop} onEditTags={noop} />`.

- [ ] **Step 7: Render the sheet from the page.** In `src/features/activities/shows/Shows.tsx`:
  - Add `import { TagSheet } from './TagSheet';`
  - After the `filterByTag` callback, add:

```tsx
  // The Tags sheet is the page's, not the card's: the grid keeps one card per child (Show more's focus).
  const [tagging, setTagging] = useState<string | null>(null);
  const editTags = useCallback((show: Show): void => setTagging(show.id), []);
  const taggingShow = tagging === null ? undefined : rows.find((row) => row.id === tagging);
```

  - Pass it to every card: `<ShowCard key={show.id} show={show} revealed={revealed?.id === show.id ? revealed.at : undefined} onTag={filterByTag} onEditTags={editTags} />`.
  - Before the final `{sheet}` in the main return, add:

```tsx
      {taggingShow !== undefined && <TagSheet show={taggingShow} shows={rows} onClose={() => setTagging(null)} />}
```

- [ ] **Step 8: Run the tests to see them pass.** `npx vitest run src/features/activities/shows src/i18n` → all pass. `npx tsc --noEmit` → no errors.

- [ ] **Step 9: Commit.**

```bash
git add src/features/activities/shows/TagSheet.tsx src/features/activities/shows/TagSheet.module.css src/features/activities/shows/TagSheet.test.tsx src/features/activities/shows/ShowCard.tsx src/features/activities/shows/ShowCard.test.tsx src/features/activities/shows/Shows.tsx src/features/activities/shows/Shows.test.tsx src/i18n/locales/en.json src/i18n/locales/he.json
git commit -m "Shows: a Tags sheet in each card's details

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, the full suite and a look in the browser

**Files:**
- Modify: `src/features/activities/README.md`

- [ ] **Step 1: The activities README.** Read its "Rules & gotchas" first. Then:
  - Files table: replace the `shows/GenrePicker.tsx` row with:
    `| \`shows/ChipFilter.tsx\` (+ \`ChipFilter.module.css\`) | The genre and tag filters: a button (a chip on phones) naming what is picked, and a sheet of chips with counts, Clear, and Show N shows. The button and chip are \`position: relative\`, holding their hidden label. |`
  - Add a row after it:
    `| \`shows/TagSheet.tsx\` (+ \`TagSheet.module.css\`, \`TagSheet.test.tsx\`) | One show's tags, opened from its card's details and rendered by the page: every family tag as a toggle chip, a field that narrows them or adds one, Done. Each press saves. |`
  - In the `shows/Shows.tsx` row, replace `genres (\`GenrePicker\`)` with `genres and tags (\`ChipFilter\`)` and `opens \`AddShow\`` with `opens \`AddShow\` and a show's \`TagSheet\``.
  - In the `shows/ShowCard.tsx` row, replace `the genres under it (\`Genres\`, also in the add sheet's preview), and the details toggle` with `the genres under it (\`Genres\`, also in the add sheet's preview), the family's tags under those (\`Tags\`, each a button that filters by it), and the details toggle`, and `behind it the plot, when the details were read, Refresh and Delete with confirmation` with `behind it the plot, when the details were read, Tags, Refresh, Drop it and Delete with confirmation`.
  - In "How it works", replace `(a button on desktop, a chip on phones, \`GenrePicker.tsx\`)` with `(a button on desktop, a chip on phones, \`ChipFilter.tsx\`, with the theatre masks)`, then add after the genre-search bullet:
    - `- Tags are the family's own labels ("Bad movie", "Christmas"), shared by everyone and kept as typed, in any language, never translated. A tagged card shows them as chips under the genres (\`Tags\` in \`ShowCard.tsx\`); a card without tags has no row. Each chip is a button named "Show only shows tagged …": it adds its tag to the Tags filter and scrolls back up to the toolbar (\`filterByTag\` in \`Shows.tsx\`).`
    - `- Tags in a card's details opens \`TagSheet.tsx\`, rendered by the page: every tag the family uses, A to Z, pressed for this show's, and a field that narrows them or offers Add "…" (Enter does the same). Each press saves at once through \`setTags()\`; Done only closes. A typed tag is tidied and takes the family's spelling when one differs only in case (\`tidyTag()\`, \`withTag()\` in \`../../domain/shows.ts\`). A tag taken off its last show stays in the sheet until it closes. A show has at most 20 tags of up to 30 characters.`
    - `- The Tags control (\`ChipFilter\` with the tag icon, beside Genres) appears once any show has a tag, or while one is picked. A show must have every tag picked, whatever the case; the counts, Clear, Show all and a reveal after Add show work as they do for genres. The search finds a tag by the start of one of its words, as it finds a genre.`
  - In "How it works", in the bullet about filters being a device preference, replace `The status, kind and genre filters and the sort` with `The status, kind, genre and tag filters and the sort`, and `A view saved before genres reads as no genres picked` with `A view saved before genres or tags reads as none picked`.
  - In "Rules & gotchas":
    - Replace `\`genres\`, the one list, is compared item by item.` with `\`genres\` and \`tags\`, the two lists, are compared item by item. The memo also compares \`onTag\` and \`onEditTags\`: the page must keep them the same functions between renders (\`useCallback\`), or every card re-renders on every keystroke.`
    - Replace `(\`position: relative\` in \`GenrePicker.module.css\`)` with `(\`position: relative\` in \`ChipFilter.module.css\`)`, and `With genres picked, the picker's chip carries` with `With genres or tags picked, the filter's chip carries`.
    - Add: `- Write tags as a whole list through \`setTags()\`; removing the last writes \`[]\`, never \`undefined\` (the column is not null). Tags render inside \`<bdi>\`, as typed; the tag filter holds them as typed too.`
    - Add: `- The Tags sheet is rendered by the page, not inside the card: the grid must keep one card per child, and cards sit under \`content-visibility: auto\`.`
  - In "Tests": after `the star's label and \`aria-pressed\`, and a press that stars then unstars the show.` add ` \`Tags\` draws a chip per tag, named for what it does, asks for the filter when pressed and draws nothing without tags; \`sameShow()\` compares tags item by item.` After the genre cases of `shows/Shows.test.tsx` (before `\`shows/Poster.test.tsx\``) add `; no Tags control until a show has a tag, two tags picked down to the one show with both and the status counts following, Clear and Show all clearing them, tags found in the search by the start of a word, a chip pressed on a card filtering by it, and a tag added from a card's details showing on the card.` Add a sentence: `\`shows/TagSheet.test.tsx\` (local store): every family tag A to Z with this show's pressed, a new tag added with Enter or Add, a known tag typed in another case saved in the family's spelling, the list narrowed as you type, a tag taken off its last show kept until the sheet closes, the field stopped at 20 tags, and the first-tag hint.` In the `shows/actions.test.ts` sentence, add `\`setTags()\` saving a list and \`[]\`, and tags kept through a status change, a drop and a restore, the star and a refresh;`.

- [ ] **Step 2: The full suite and the build.**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → all pass (the live Supabase suites are skipped: no `.env.test` in the worktree).
Run: `npx vite build --mode demo --outDir "$TEMP/shows-tags-dist"` → builds. (The production build refuses without the Supabase variables; the demo build checks bundling.)

- [ ] **Step 3: Look at it in the browser.** The worktree's `node_modules` is a junction to the main checkout's, so give this dev server its own Vite cache. Create `vite.local.config.ts` in the worktree (local only):

```ts
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

export default defineConfig((env) => mergeConfig(base(env), { cacheDir: '.vite-cache', server: { fs: { strict: false } } }));
```

and keep it and the cache out of git: `printf 'vite.local.config.ts\n.vite-cache/\n' >> "$(git rev-parse --git-common-dir)/info/exclude"`.

Add a temporary entry to `C:\Users\Mercury\Claude Projects\Nestead\.claude\launch.json` (`preview_start` reads only that file):

```json
    {
      "name": "dev-tags",
      "runtimeExecutable": "powershell",
      "runtimeArgs": ["-NoProfile", "-Command", "Set-Location '.worktrees/shows-tags'; $env:VITE_BACKEND='local'; npx.cmd vite --config vite.local.config.ts --port 5177 --strictPort"],
      "port": 5177
    }
```

Start it with `preview_start {name: "dev-tags"}`, open `/shows`, and check, then fix anything that is off:
1. Add two or three shows from the demo list; open a card's details, press Tags, add "Bad movie", add "bad movie" on a second show (it saves as "Bad movie"), and add a Hebrew tag.
2. The chips sit under the genres, wrap, and a one-line-title card stays the poster's height.
3. A chip press filters, the Tags control names the tag, and the page scrolls up to the toolbar.
4. The Tags filter sheet lists the tags with counts; Clear and Show all work.
5. `resize_window` mobile preset: the Tags chip sits in the scrolling row after Genres; `document.documentElement.scrollWidth === innerWidth` with tags picked and with the Tags sheet open (the 8c4516c bug must not come back).
6. Dark theme (`resize_window colorScheme: dark`, or the theme toggle): chips readable, distinct from the status badges.
7. Hebrew (Settings → language): sheet title, chips and the Add chip read right to left; an English tag inside Hebrew text stays whole.

Take a screenshot of a tagged card in light and dark for the user. Then `preview_stop`, remove the `dev-tags` entry from `launch.json`, and delete `.vite-cache`.

- [ ] **Step 4: Commit.**

```bash
git add src/features/activities/README.md
git commit -m "Shows: README for tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rollout (with the user, after Task 8)

Not for a subagent: each step needs the user.

1. **The user applies `supabase/migrations/20261005140000_shows_tags.sql` to production** (the SQL editor in the Supabase dashboard). Production and the test families share one project.
2. **Run the live suites:** copy `..\..\Nestead\.env.test` into the worktree, run `npx vitest run src/data/supabase`, then delete the copy. The contract's tags case must pass on Supabase.
3. **Merge:** check `git -C ..\..\Nestead status` for peers' uncommitted work, then fast-forward `main` to `shows/tags` the way `shared-checkout-sessions` describes (reset the index to the branch for the touched paths, then `git merge --ff-only`). The docs hook must pass. It also flags `src/i18n/README.md` for the locale changes: that README lists no key groups, so after reading it, `# docs-ok` is the right answer there.
4. **Push with the user's go-ahead**, then check the deploy (public Actions API) and that the live bundle has `shows.tags` strings.
5. Remove the worktree and branch when the user says so.
