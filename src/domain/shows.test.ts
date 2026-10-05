import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOW_VIEW,
  REFRESHED_FIELDS,
  SHOWS_PAGE,
  filterShows,
  genreCounts,
  lacksGenres,
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

describe('genres', () => {
  const rushHour = show('Rush Hour', { genres: ['Action', 'Comedy', 'Crime'] });
  const heat = show('Heat', { genres: ['Action', 'Crime', 'Drama'] });
  const airplane = show('Airplane!', { genres: ['Comedy'] });
  const dune = show('Dune', { genres: ['Action', 'Adventure', 'Sci-Fi'] });
  const romcom = show('Iron Hearts', { genres: ['Comedy', 'Romance'] });
  const old = show('Older Entry');
  const shelf = [rushHour, heat, airplane, dune, romcom, old];
  const none = { query: '', status: 'all', kind: 'all' } as const;
  const HEBREW: Record<string, string> = { Action: 'אקשן', Comedy: 'קומדיה', 'Sci-Fi': 'מדע בדיוני' };

  it('keeps shows with every genre picked', () => {
    expect(titles(filterShows(shelf, { ...none, genres: ['Action'] }))).toEqual(['Rush Hour', 'Heat', 'Dune']);
    expect(titles(filterShows(shelf, { ...none, genres: ['Action', 'Comedy'] }))).toEqual(['Rush Hour']);
    expect(filterShows(shelf, { ...none, genres: ['Action', 'Romance'] })).toEqual([]);
    expect(filterShows(shelf, { ...none, genres: [] })).toEqual(shelf);
  });

  it('finds every genre typed, in any order and case', () => {
    expect(titles(filterShows(shelf, { ...none, query: 'action comedy' }))).toEqual(['Rush Hour']);
    expect(titles(filterShows(shelf, { ...none, query: 'COMEDY  Action ' }))).toEqual(['Rush Hour']);
    expect(titles(filterShows(shelf, { ...none, query: 'comedy' }))).toEqual(['Rush Hour', 'Airplane!', 'Iron Hearts']);
  });

  it('mixes title words and genres', () => {
    expect(titles(filterShows(shelf, { ...none, query: 'rush action' }))).toEqual(['Rush Hour']);
    expect(filterShows(shelf, { ...none, query: 'heat comedy' })).toEqual([]);
    // Each word in the title, in any order: wider than the title as typed, never narrower.
    expect(titles(filterShows(shelf, { ...none, query: 'hour rush' }))).toEqual(['Rush Hour']);
  });

  it('finds a genre by the start of its words, never by the middle', () => {
    expect(titles(filterShows(shelf, { ...none, query: 'act' }))).toEqual(['Rush Hour', 'Heat', 'Dune']);
    for (const query of ['sci', 'fi', 'sci-fi', 'scifi', 'Sci Fi']) {
      expect(titles(filterShows(shelf, { ...none, query })), query).toEqual(['Dune']);
    }
    // "man" is inside Romance, but starts none of its words: only titles count.
    expect(filterShows(shelf, { ...none, query: 'man' })).toEqual([]);
    expect(titles(filterShows(shelf, { ...none, query: 'iron' }))).toEqual(['Iron Hearts']);
  });

  it('finds a genre by its name in the screen language too', () => {
    const genreName = (genre: string): string => HEBREW[genre] ?? genre;
    expect(titles(filterShows(shelf, { ...none, query: 'קומדיה אקשן', genreName }))).toEqual(['Rush Hour']);
    expect(titles(filterShows(shelf, { ...none, query: 'בדיוני', genreName }))).toEqual(['Dune']);
    // English still works beside it.
    expect(titles(filterShows(shelf, { ...none, query: 'sci-fi', genreName }))).toEqual(['Dune']);
    expect(filterShows(shelf, { ...none, query: 'קומדיה' })).toEqual([]);
  });

  it('combines genres with the search, status and kind', () => {
    const series = show('Brooklyn Nine-Nine', { kind: 'series', genres: ['Comedy', 'Crime'], status: 'watched' });
    const withSeries = [...shelf, series];
    expect(titles(filterShows(withSeries, { ...none, genres: ['Crime'], query: 'comedy' }))).toEqual(['Rush Hour', 'Brooklyn Nine-Nine']);
    expect(titles(filterShows(withSeries, { ...none, kind: 'series', genres: ['Crime'] }))).toEqual(['Brooklyn Nine-Nine']);
    expect(titles(filterShows(withSeries, { ...none, status: 'to-watch', genres: ['Crime'] }))).toEqual(['Rush Hour', 'Heat']);
  });

  it('leaves out shows without genres once a genre is asked for', () => {
    expect(filterShows(shelf, { ...none, genres: ['Drama'] })).toEqual([heat]);
    expect(filterShows([old], { ...none, query: 'drama' })).toEqual([]);
    expect(filterShows([old], { ...none, query: 'older' })).toEqual([old]);
  });

  it('counts each genre', () => {
    expect(Object.fromEntries(genreCounts(shelf))).toEqual({ Action: 3, Comedy: 3, Crime: 2, Drama: 1, Adventure: 1, 'Sci-Fi': 1, Romance: 1 });
    expect(genreCounts([]).size).toBe(0);
  });

  it('tells a show never read for genres from one read with none', () => {
    expect(lacksGenres(old)).toBe(true);
    expect(lacksGenres(show('Silent Short', { genres: [] }))).toBe(false);
    expect(lacksGenres(heat)).toBe(false);
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
    expect(parseShowView({ status: 'watched', kind: 'series', sort: 'rating' })).toEqual({ status: 'watched', kind: 'series', genres: [], sort: 'rating' });
    expect(parseShowView({ status: 'all', kind: 'all', genres: ['Action', 'Comedy'], sort: 'added' }).genres).toEqual(['Action', 'Comedy']);
    expect(parseShowView({ status: 'dropped', kind: 'all', sort: 'added' }).status).toBe('dropped');
  });

  it('falls back field by field for junk', () => {
    expect(parseShowView(undefined)).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView('watched')).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView({ status: 'seen', kind: 'game', sort: 'random' })).toEqual(DEFAULT_SHOW_VIEW);
    expect(parseShowView({ status: 'watching', kind: 3 })).toEqual({ ...DEFAULT_SHOW_VIEW, status: 'watching' });
    // Views saved before genres had none.
    expect(parseShowView({ status: 'all', kind: 'all', sort: 'added' }).genres).toEqual([]);
    expect(parseShowView({ genres: 'Action' }).genres).toEqual([]);
    expect(parseShowView({ genres: ['Action', 3, '', ' ', null, 'Action', 'Drama'] }).genres).toEqual(['Action', 'Drama']);
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

  it("updates the fetched fields and fetchedAt, and keeps status and watchedAt", () => {
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
    const patch = refreshPatch({ ...fresh, status: 'to-watch', watchedAt: undefined, createdBy: 'm2' } as FetchedDetails, fetchedAt);
    expect(Object.keys(patch).sort()).toEqual([...REFRESHED_FIELDS].sort());
    for (const key of ['status', 'watchedAt', 'createdBy', 'imdbId', 'kind', 'id', 'familyId', 'createdAt', 'updatedAt']) {
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

  it('saves the genres, and an empty list when the service names none', () => {
    expect(apply(breakingBad, refreshPatch({ ...fresh, genres: ['Crime', 'Drama'] }, fetchedAt)).genres).toEqual(['Crime', 'Drama']);
    const withGenres = { ...breakingBad, genres: ['Crime'] };
    // Read and empty, so it no longer counts as never read (lacksGenres()).
    expect(apply(withGenres, refreshPatch(fresh, fetchedAt)).genres).toEqual([]);
    expect(lacksGenres(apply(breakingBad, refreshPatch(fresh, fetchedAt)))).toBe(false);
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
      genres: [],
      fetchedAt: '2026-10-04T12:00:00.000Z',
      status: 'to-watch',
      createdBy: 'm1',
    });
    expect(newShow({ imdbId: 'tt1375666', kind: 'movie', title: 'Inception', genres: ['Action', 'Sci-Fi'] }, '2026-10-04T12:00:00.000Z').genres).toEqual(['Action', 'Sci-Fi']);
    expect(row).not.toHaveProperty('watchedAt');
    expect(row).not.toHaveProperty('posterUrl');
  });
});
