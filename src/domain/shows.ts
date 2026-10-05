import type { NewRow, Show, ShowKind, ShowStatus } from './types';

/**
 * The Shows page's logic: filtering and sorting saved rows, the status cycle,
 * and which fetched fields a refresh may overwrite. Nothing here calls
 * /api/shows: the list works on what was saved when each show was added.
 */

/** Every status, in the order the filters list them. */
export const SHOW_STATUSES: readonly ShowStatus[] = ['to-watch', 'watching', 'watched', 'dropped'];

/** What the status badge cycles through. Dropped is set on purpose (Drop it), not by cycling past Watched. */
const CYCLE: readonly ShowStatus[] = ['to-watch', 'watching', 'watched'];

export type StatusFilter = 'all' | ShowStatus;
export type KindFilter = 'all' | ShowKind;
export type ShowSort = 'added' | 'favorites' | 'title' | 'released' | 'rating';

export const SHOW_SORTS: readonly ShowSort[] = ['added', 'favorites', 'title', 'released', 'rating'];

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

/** Each genre among these shows, with how many have it. */
export function genreCounts(shows: readonly Show[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const show of shows) for (const genre of show.genres ?? []) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  return counts;
}

/** A show added before genres were saved: reading its details again fills them in. */
export function lacksGenres(show: Show): boolean {
  return show.genres === undefined;
}

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

/** Each tag by its case-folded key, in the first spelling met. */
function spellings(tags: readonly string[]): Map<string, string> {
  const named = new Map<string, string>();
  for (const tag of tags) if (!named.has(tagKey(tag))) named.set(tagKey(tag), tag);
  return named;
}

/**
 * Each tag among these shows, with how many have it. Spellings that differ
 * only in case count as one tag, named as in `spelling` when it has the tag
 * in any case (the family's tags, for a list narrowed to a few shows), and
 * otherwise as first met.
 */
export function tagCounts(shows: readonly Show[], spelling: readonly string[] = []): Map<string, number> {
  const named = spellings(spelling);
  const counts = new Map<string, number>();
  for (const show of shows) {
    for (const tag of show.tags ?? []) {
      const name = named.get(tagKey(tag)) ?? tag;
      named.set(tagKey(tag), name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * A picked list of tags in the family's spellings: each tag becomes the entry
 * of `spelling` that matches it in any case (kept as it is when none does),
 * each once, in order.
 */
export function spelledAs(tags: readonly string[], spelling: readonly string[]): string[] {
  const named = spellings(spelling);
  const result = new Map<string, string>();
  for (const tag of tags) if (!result.has(tagKey(tag))) result.set(tagKey(tag), named.get(tagKey(tag)) ?? tag);
  return [...result.values()];
}

/** Every tag the family uses, each once, spelled as first met. Screens sort it. */
export function familyTags(shows: readonly Show[]): string[] {
  return [...tagCounts(shows).keys()];
}

/** Ties keep a fixed order: by title, then id. */
function byTitle(compareText: (a: string, b: string) => number) {
  return (a: Show, b: Show): number => compareText(a.title, b.title) || a.id.localeCompare(b.id);
}

/** Missing values go last, whichever way the rest run. */
function descending(a: number | string | undefined, b: number | string | undefined): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
  return a < b ? 1 : a > b ? -1 : 0;
}

/**
 * `added`: newest first. `favorites`: starred shows first, each group newest
 * added first. `title`: A to Z. `released`: newest release first, by date or
 * else year. `rating`: highest IMDb rating first. Shows without the value
 * sorted on go last.
 */
export function sortShows(shows: readonly Show[], sort: ShowSort, compareText: (a: string, b: string) => number = (a, b) => a.localeCompare(b)): Show[] {
  const tie = byTitle(compareText);
  const sorted = [...shows];
  switch (sort) {
    case 'added':
      return sorted.sort((a, b) => descending(a.createdAt, b.createdAt) || tie(a, b));
    case 'favorites':
      return sorted.sort((a, b) => Number(b.favorite === true) - Number(a.favorite === true) || descending(a.createdAt, b.createdAt) || tie(a, b));
    case 'title':
      return sorted.sort(tie);
    case 'released':
      return sorted.sort((a, b) => descending(a.released ?? yearDate(a.year), b.released ?? yearDate(b.year)) || tie(a, b));
    case 'rating':
      return sorted.sort((a, b) => descending(a.imdbRating, b.imdbRating) || tie(a, b));
  }
}

function yearDate(year: number | undefined): string | undefined {
  return year === undefined ? undefined : `${String(year).padStart(4, '0')}-01-01`;
}

/**
 * Cards built at a time. A family's list of 40 opens whole; a long one opens
 * a page at a time, with Show more for the next (docs/PERFORMANCE.md).
 */
export const SHOWS_PAGE = 60;

/**
 * How many of a list of `total` to build: `pages` whole pages, and as many
 * more as it takes to reach the show at index `include` (-1 for none), such
 * as one just added that sorts further down.
 */
export function shownCount(total: number, pages: number, include = -1): number {
  const reach = include < 0 ? 0 : Math.ceil((include + 1) / SHOWS_PAGE);
  return Math.min(total, Math.max(pages, reach) * SHOWS_PAGE);
}

/** To watch, then Watching, then Watched, then round again. A dropped show comes back as To watch. */
export function nextStatus(status: ShowStatus): ShowStatus {
  if (status === 'dropped') return 'to-watch';
  return CYCLE[(CYCLE.indexOf(status) + 1) % CYCLE.length] as ShowStatus;
}

/**
 * The patch that moves a show to `status`: watchedAt is set when it becomes
 * watched and cleared (undefined clears a field) when it is anything else.
 */
export function statusPatch(status: ShowStatus, now: string): Pick<NewRow<Show>, 'status' | 'watchedAt'> {
  return { status, watchedAt: status === 'watched' ? now : undefined };
}

/** One title's details as /api/shows gives them (server/shows ShowDetails has this shape). */
export type FetchedDetails = Pick<Show, 'imdbId' | 'kind' | 'title'> &
  Partial<Pick<Show, 'plot' | 'posterUrl' | 'released' | 'year' | 'runtimeMin' | 'totalSeasons' | 'imdbRating' | 'genres'>>;

/** What a refresh may overwrite: the fetched fields and when they were read, never the family's own. */
export const REFRESHED_FIELDS = ['title', 'plot', 'posterUrl', 'released', 'year', 'runtimeMin', 'totalSeasons', 'imdbRating', 'genres', 'fetchedAt'] as const;

export type RefreshPatch = Pick<NewRow<Show>, (typeof REFRESHED_FIELDS)[number]>;

/**
 * The patch a refresh writes. Every fetched field is in it, so one the service
 * no longer has is cleared rather than left stale. `status`, `watchedAt`,
 * `favorite`, `createdBy`, `imdbId` and `kind` are never in it.
 */
export function refreshPatch(details: FetchedDetails, fetchedAt: string): RefreshPatch {
  return {
    title: details.title,
    plot: details.plot,
    posterUrl: details.posterUrl,
    released: details.released,
    year: details.year,
    runtimeMin: details.runtimeMin,
    totalSeasons: details.totalSeasons,
    imdbRating: details.imdbRating,
    // Empty, not cleared: the details were read and named no genre (absent means never read, lacksGenres()).
    genres: details.genres ?? [],
    fetchedAt,
  };
}

/** A new row for the family's list: the fetched details, To watch. */
export function newShow(details: FetchedDetails, fetchedAt: string, createdBy?: string): NewRow<Show> {
  const row: NewRow<Show> = { ...refreshPatch(details, fetchedAt), imdbId: details.imdbId, kind: details.kind, status: 'to-watch' };
  if (createdBy !== undefined) row.createdBy = createdBy;
  // Absent, not undefined: a new row has nothing to clear.
  for (const key of Object.keys(row) as (keyof NewRow<Show>)[]) if (row[key] === undefined) delete row[key];
  return row;
}
