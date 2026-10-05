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
  sort: ShowSort;
}

export const DEFAULT_SHOW_VIEW: ShowView = { status: 'all', kind: 'all', sort: 'added' };

/** Rebuilds a view from a stored preference, ignoring anything malformed. */
export function parseShowView(raw: unknown): ShowView {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SHOW_VIEW;
  const { status, kind, sort } = raw as Record<string, unknown>;
  return {
    status: status === 'all' || SHOW_STATUSES.includes(status as ShowStatus) ? (status as StatusFilter) : DEFAULT_SHOW_VIEW.status,
    kind: kind === 'all' || kind === 'movie' || kind === 'series' ? kind : DEFAULT_SHOW_VIEW.kind,
    sort: SHOW_SORTS.includes(sort as ShowSort) ? (sort as ShowSort) : DEFAULT_SHOW_VIEW.sort,
  };
}

export interface ShowFilter {
  /** Matched case-insensitively against the title. */
  query: string;
  /** `all` is every show the family still means to watch or has: dropped ones only show under `dropped`. */
  status: StatusFilter;
  kind: KindFilter;
}

export function filterShows(shows: readonly Show[], filter: ShowFilter): Show[] {
  const needle = filter.query.trim().toLocaleLowerCase();
  return shows.filter(
    (show) =>
      (filter.status === 'all' ? show.status !== 'dropped' : show.status === filter.status) &&
      (filter.kind === 'all' || show.kind === filter.kind) &&
      (needle === '' || show.title.toLocaleLowerCase().includes(needle)),
  );
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
  Partial<Pick<Show, 'plot' | 'posterUrl' | 'released' | 'year' | 'runtimeMin' | 'totalSeasons' | 'imdbRating'>>;

/** What a refresh may overwrite: the fetched fields and when they were read, never the family's own. */
export const REFRESHED_FIELDS = ['title', 'plot', 'posterUrl', 'released', 'year', 'runtimeMin', 'totalSeasons', 'imdbRating', 'fetchedAt'] as const;

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
