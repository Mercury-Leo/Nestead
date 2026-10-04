import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOW_VIEW,
  REFRESHED_FIELDS,
  filterShows,
  newShow,
  nextStatus,
  parseShowView,
  refreshPatch,
  sortShows,
  statusPatch,
} from './shows';
import type { OmdbDetails } from './shows';
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

describe('parseShowView', () => {
  it('keeps a valid stored view', () => {
    expect(parseShowView({ status: 'watched', kind: 'series', sort: 'rating' })).toEqual({ status: 'watched', kind: 'series', sort: 'rating' });
  });

  it('falls back field by field for junk', () => {
    expect(parseShowView(undefined)).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView('watched')).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView({ status: 'seen', kind: 'game', sort: 'random' })).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView({ status: 'watching', kind: 3 })).toEqual({ ...DEFAULT_SHOW_VIEW, status: 'watching' });
  });
});

describe('the status cycle', () => {
  it('goes To watch, Watching, Watched and round again', () => {
    expect(nextStatus('to-watch')).toBe('watching');
    expect(nextStatus('watching')).toBe('watched');
    expect(nextStatus('watched')).toBe('to-watch');
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
  const fresh: OmdbDetails = {
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

  it("updates OMDb's fields and fetchedAt, and keeps status and watchedAt", () => {
    const watched = { ...breakingBad, status: 'watched' as const, watchedAt: '2026-09-01T20:00:00.000Z' };
    const after = apply(watched, refreshPatch(fresh, fetchedAt));
    expect(after.imdbRating).toBe(9.6);
    expect(after.runtimeMin).toBe(47);
    expect(after.plot).toBe('Newer plot.');
    expect(after.posterUrl).toBe('https://m.media-amazon.com/images/M/new.jpg');
    expect(after.fetchedAt).toBe(fetchedAt);
    expect(after.status).toBe('watched');
    expect(after.watchedAt).toBe('2026-09-01T20:00:00.000Z');
    expect(after.createdBy).toBe(watched.createdBy);
    expect(after.id).toBe(watched.id);
  });

  it('writes exactly the refreshed fields, never status, watchedAt or who added it', () => {
    const patch = refreshPatch({ ...fresh, status: 'to-watch', watchedAt: undefined, createdBy: 'm2' } as OmdbDetails, fetchedAt);
    expect(Object.keys(patch).sort()).toEqual([...REFRESHED_FIELDS].sort());
    for (const key of ['status', 'watchedAt', 'createdBy', 'imdbId', 'kind', 'id', 'familyId', 'createdAt', 'updatedAt']) {
      expect(patch, key).not.toHaveProperty(key);
    }
  });

  it('clears a field OMDb no longer has', () => {
    const { posterUrl: _posterUrl, imdbRating: _rating, ...without } = fresh;
    const after = apply(breakingBad, refreshPatch(without, fetchedAt));
    expect(after.posterUrl).toBeUndefined();
    expect(after.imdbRating).toBeUndefined();
    expect(after.title).toBe('Breaking Bad');
  });
});

describe('newShow', () => {
  it("starts To watch, with OMDb's details, the reader's time and who added it", () => {
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
  });
});
