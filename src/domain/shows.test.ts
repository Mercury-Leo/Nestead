import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOW_VIEW,
  REFRESHED_FIELDS,
  SHOWS_PAGE,
  filterShows,
  newShow,
  nextStatus,
  parseShowView,
  refreshPatch,
  shownCount,
  sortShows,
  statusPatch,
} from './shows';
import type { FetchedDetails } from './shows';
import type { Show } from './types';

let next = 0;
function show(title: string, extra: Partial<Show> = {}): Show {
  next += 1;
  const at = new Date(Date.UTC(2026, 9, 1, 0, next)).toISOString();
  return {
    id: `s${String(next).padStart(2, '0')}`,
    familyId: 'f',
    createdAt: at,
    updatedAt: at,
    imdbId: `tt${String(1000000 + next)}`,
    kind: 'movie',
    title,
    fetchedAt: at,
    status: 'to-watch',
    ...extra,
  };
}

const inception = show('Inception', { year: 2010, released: '2010-07-16', imdbRating: 8.8, runtimeMin: 148 });
const breakingBad = show('Breaking Bad', { kind: 'series', year: 2008, released: '2008-01-20', imdbRating: 9.5, totalSeasons: 5, status: 'watching' });
const office = show('The Office', { kind: 'series', year: 2005, status: 'watched', watchedAt: '2026-09-30T20:00:00.000Z' });
const upcoming = show('Untitled Sequel', { year: 2027 });
const all = [inception, breakingBad, office, upcoming];

const titles = (shows: Show[]): string[] => shows.map((row) => row.title);

describe('filterShows', () => {
  it('keeps everything with no filter', () => {
    expect(filterShows(all, { query: '', status: 'all', kind: 'all' })).toEqual(all);
  });

  it('keeps dropped shows out of All, and shows them under Dropped', () => {
    const dropped = show('Endless Saga', { kind: 'series', status: 'dropped' });
    const withDropped = [...all, dropped];
    expect(filterShows(withDropped, { query: '', status: 'all', kind: 'all' })).toEqual(all);
    expect(filterShows(withDropped, { query: 'saga', status: 'all', kind: 'all' })).toEqual([]);
    expect(filterShows(withDropped, { query: '', status: 'dropped', kind: 'all' })).toEqual([dropped]);
    expect(filterShows(withDropped, { query: '', status: 'dropped', kind: 'movie' })).toEqual([]);
  });

  it('narrows by status', () => {
    expect(titles(filterShows(all, { query: '', status: 'to-watch', kind: 'all' }))).toEqual(['Inception', 'Untitled Sequel']);
    expect(titles(filterShows(all, { query: '', status: 'watching', kind: 'all' }))).toEqual(['Breaking Bad']);
    expect(titles(filterShows(all, { query: '', status: 'watched', kind: 'all' }))).toEqual(['The Office']);
  });

  it('narrows by kind', () => {
    expect(titles(filterShows(all, { query: '', status: 'all', kind: 'series' }))).toEqual(['Breaking Bad', 'The Office']);
    expect(titles(filterShows(all, { query: '', status: 'all', kind: 'movie' }))).toEqual(['Inception', 'Untitled Sequel']);
  });

  it('matches part of the title, whatever the case, and combines with the rest', () => {
    expect(titles(filterShows(all, { query: '  OFF ', status: 'all', kind: 'all' }))).toEqual(['The Office']);
    expect(titles(filterShows(all, { query: 'in', status: 'all', kind: 'all' }))).toEqual(['Inception', 'Breaking Bad']);
    expect(titles(filterShows(all, { query: 'in', status: 'all', kind: 'series' }))).toEqual(['Breaking Bad']);
    expect(filterShows(all, { query: 'in', status: 'watched', kind: 'all' })).toEqual([]);
  });
});

describe('sortShows', () => {
  it('puts the newest additions first', () => {
    expect(titles(sortShows(all, 'added'))).toEqual(['Untitled Sequel', 'The Office', 'Breaking Bad', 'Inception']);
  });

  it('puts favourites first, each group newest added first', () => {
    const starred = [{ ...inception, favorite: true }, breakingBad, { ...office, favorite: true }, { ...upcoming, favorite: false }];
    expect(titles(sortShows(starred, 'favorites'))).toEqual(['The Office', 'Inception', 'Untitled Sequel', 'Breaking Bad']);
    // With none starred, it is the newest-added order.
    expect(titles(sortShows(all, 'favorites'))).toEqual(titles(sortShows(all, 'added')));
  });

  it('sorts titles A to Z', () => {
    expect(titles(sortShows(all, 'title'))).toEqual(['Breaking Bad', 'Inception', 'The Office', 'Untitled Sequel']);
  });

  it('sorts by release, newest first, using the year when there is no date, and the rest last', () => {
    const noDate = show('Mystery Film');
    expect(titles(sortShows([...all, noDate], 'released'))).toEqual(['Untitled Sequel', 'Inception', 'Breaking Bad', 'The Office', 'Mystery Film']);
  });

  it('sorts by IMDb rating, highest first, unrated last by title', () => {
    expect(titles(sortShows(all, 'rating'))).toEqual(['Breaking Bad', 'Inception', 'The Office', 'Untitled Sequel']);
  });

  it('breaks ties by title, and leaves the input alone', () => {
    const a = show('Alpha', { imdbRating: 7 });
    const b = show('Beta', { imdbRating: 7 });
    const input = [b, a];
    expect(titles(sortShows(input, 'rating'))).toEqual(['Alpha', 'Beta']);
    expect(titles(input)).toEqual(['Beta', 'Alpha']);
  });
});

describe('shownCount', () => {
  it('builds whole pages, never more than the list', () => {
    expect(SHOWS_PAGE).toBe(60);
    expect(shownCount(300, 1)).toBe(60);
    expect(shownCount(300, 2)).toBe(120);
    expect(shownCount(130, 3)).toBe(130);
    expect(shownCount(40, 1)).toBe(40);
    expect(shownCount(0, 1)).toBe(0);
  });

  it('reaches a show that sorts past the pages asked for, to the end of its page', () => {
    expect(shownCount(300, 1, 59)).toBe(60);
    expect(shownCount(300, 1, 60)).toBe(120);
    expect(shownCount(300, 1, 239)).toBe(240);
    expect(shownCount(300, 1, 299)).toBe(300);
    // Already built: the pages asked for stand.
    expect(shownCount(300, 3, 10)).toBe(180);
    expect(shownCount(300, 1, -1)).toBe(60);
  });
});

describe('parseShowView', () => {
  it('keeps a valid stored view', () => {
    expect(parseShowView({ status: 'watched', kind: 'series', sort: 'rating' })).toEqual({ status: 'watched', kind: 'series', sort: 'rating' });
    expect(parseShowView({ status: 'dropped', kind: 'all', sort: 'added' }).status).toBe('dropped');
    expect(parseShowView({ status: 'all', kind: 'all', sort: 'favorites' }).sort).toBe('favorites');
  });

  it('falls back field by field for junk', () => {
    expect(parseShowView(undefined)).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView('watched')).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView({ status: 'seen', kind: 'game', sort: 'random' })).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView({ status: 'watching', kind: 3 })).toEqual({ ...DEFAULT_SHOW_VIEW, status: 'watching' });
  });
});

describe('the status cycle', () => {
  it('goes To watch, Watching, Watched and round again, never into Dropped', () => {
    expect(nextStatus('to-watch')).toBe('watching');
    expect(nextStatus('watching')).toBe('watched');
    expect(nextStatus('watched')).toBe('to-watch');
  });

  it('brings a dropped show back as To watch', () => {
    expect(nextStatus('dropped')).toBe('to-watch');
  });

  it('clears watchedAt when a show is dropped', () => {
    const dropped = statusPatch('dropped', '2026-10-04T21:00:00.000Z');
    expect(dropped).toEqual({ status: 'dropped', watchedAt: undefined });
    expect('watchedAt' in dropped).toBe(true);
  });

  it('sets watchedAt on Watched and clears it otherwise', () => {
    const now = '2026-10-04T21:00:00.000Z';
    expect(statusPatch('watched', now)).toEqual({ status: 'watched', watchedAt: now });
    const back = statusPatch('to-watch', now);
    expect(back).toEqual({ status: 'to-watch', watchedAt: undefined });
    // The key is there, set to undefined: that is what clears a stored field.
    expect('watchedAt' in back).toBe(true);
    expect('watchedAt' in statusPatch('watching', now)).toBe(true);
  });
});

describe('refreshPatch', () => {
  const fetchedAt = '2026-10-04T12:00:00.000Z';
  const fresh: FetchedDetails = {
    imdbId: breakingBad.imdbId,
    kind: 'series',
    title: 'Breaking Bad',
    plot: 'Newer plot.',
    posterUrl: 'https://m.media-amazon.com/images/M/new.jpg',
    released: '2008-01-20',
    year: 2008,
    runtimeMin: 47,
    totalSeasons: 5,
    imdbRating: 9.6,
  };

  /** What the stores do with a patch: undefined clears, everything else overwrites. */
  function apply(row: Show, patch: Partial<Show>): Show {
    const out: Record<string, unknown> = { ...row, ...patch };
    for (const [key, value] of Object.entries(out)) if (value === undefined) delete out[key];
    return out as unknown as Show;
  }

  it("updates the fetched fields and fetchedAt, and keeps status, watchedAt and the star", () => {
    const watched = { ...breakingBad, status: 'watched' as const, watchedAt: '2026-09-01T20:00:00.000Z', favorite: true };
    const after = apply(watched, refreshPatch(fresh, fetchedAt));
    expect(after.imdbRating).toBe(9.6);
    expect(after.runtimeMin).toBe(47);
    expect(after.plot).toBe('Newer plot.');
    expect(after.posterUrl).toBe('https://m.media-amazon.com/images/M/new.jpg');
    expect(after.fetchedAt).toBe(fetchedAt);
    expect(after.status).toBe('watched');
    expect(after.watchedAt).toBe('2026-09-01T20:00:00.000Z');
    expect(after.favorite).toBe(true);
    expect(after.createdBy).toBe(watched.createdBy);
    expect(after.id).toBe(watched.id);
  });

  it('writes exactly the refreshed fields, never status, watchedAt, the star or who added it', () => {
    const patch = refreshPatch({ ...fresh, status: 'to-watch', watchedAt: undefined, favorite: false, createdBy: 'm2' } as FetchedDetails, fetchedAt);
    expect(Object.keys(patch).sort()).toEqual([...REFRESHED_FIELDS].sort());
    for (const key of ['status', 'watchedAt', 'favorite', 'createdBy', 'imdbId', 'kind', 'id', 'familyId', 'createdAt', 'updatedAt']) {
      expect(patch, key).not.toHaveProperty(key);
    }
  });

  it('clears a field the service no longer has', () => {
    const { posterUrl: _posterUrl, imdbRating: _rating, ...without } = fresh;
    const after = apply(breakingBad, refreshPatch(without, fetchedAt));
    expect(after.posterUrl).toBeUndefined();
    expect(after.imdbRating).toBeUndefined();
    expect(after.title).toBe('Breaking Bad');
  });
});

describe('newShow', () => {
  it("starts To watch, with the fetched details, the reader's time and who added it", () => {
    const row = newShow({ imdbId: 'tt1375666', kind: 'movie', title: 'Inception', year: 2010, imdbRating: 8.8 }, '2026-10-04T12:00:00.000Z', 'm1');
    expect(row).toEqual({
      imdbId: 'tt1375666',
      kind: 'movie',
      title: 'Inception',
      year: 2010,
      imdbRating: 8.8,
      fetchedAt: '2026-10-04T12:00:00.000Z',
      status: 'to-watch',
      createdBy: 'm1',
    });
    expect(row).not.toHaveProperty('watchedAt');
    expect(row).not.toHaveProperty('posterUrl');
    // Unstarred by leaving it out: the backend's default, and absent counts as false.
    expect(row).not.toHaveProperty('favorite');
  });
});
