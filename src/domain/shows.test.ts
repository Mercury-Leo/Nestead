import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOW_VIEW,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  REFRESHED_FIELDS,
  SHOWS_PAGE,
  familyTags,
  filterShows,
  genreCounts,
  hasTags,
  lacksGenres,
  newShow,
  nextStatus,
  parseShowView,
  refreshPatch,
  sameTag,
  shownCount,
  sortShows,
  spelledAs,
  statusPatch,
  tagCounts,
  tidyTag,
  withTag,
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

  it("names a tag the family's way when given the spellings, whatever the case", () => {
    // Santa alone has "bad movie": counted as first met, then as the family spells it.
    const narrowed = [elf, santa, plain];
    expect(Object.fromEntries(tagCounts(narrowed))).toEqual({ Christmas: 2, 'bad movie': 1 });
    expect(Object.fromEntries(tagCounts(narrowed, ['Bad movie']))).toEqual({ Christmas: 2, 'Bad movie': 1 });
    // A tag the spellings lack is named as first met.
    expect(Object.fromEntries(tagCounts(narrowed, ['Movie night']))).toEqual({ Christmas: 2, 'bad movie': 1 });
  });

  it("maps a picked list to the family's spellings, each once, in order", () => {
    expect(spelledAs(['bad movie', 'Christmas', 'BAD MOVIE'], ['Bad movie', 'Christmas'])).toEqual(['Bad movie', 'Christmas']);
    // A tag the family does not have is kept as it is.
    expect(spelledAs(['Cult classic', 'christmas'], ['Bad movie', 'Christmas'])).toEqual(['Cult classic', 'Christmas']);
    expect(spelledAs([], ['Bad movie'])).toEqual([]);
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
    expect(parseShowView({ status: 'watched', kind: 'series', sort: 'rating' })).toEqual({ status: 'watched', kind: 'series', genres: [], tags: [], sort: 'rating' });
    expect(parseShowView({ status: 'all', kind: 'all', genres: ['Action', 'Comedy'], sort: 'added' }).genres).toEqual(['Action', 'Comedy']);
    expect(parseShowView({ status: 'all', kind: 'all', tags: ['Bad movie', 'סרט רע'], sort: 'added' }).tags).toEqual(['Bad movie', 'סרט רע']);
    expect(parseShowView({ status: 'dropped', kind: 'all', sort: 'added' }).status).toBe('dropped');
    expect(parseShowView({ status: 'all', kind: 'all', sort: 'favorites' }).sort).toBe('favorites');
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
    // Views saved before tags had none.
    expect(parseShowView({ status: 'all', kind: 'all', sort: 'added' }).tags).toEqual([]);
    expect(parseShowView({ tags: 'Bad movie' }).tags).toEqual([]);
    expect(parseShowView({ tags: ['Bad movie', 3, '', ' ', null, 'Bad movie', 'Christmas'] }).tags).toEqual(['Bad movie', 'Christmas']);
    expect(parseShowView({ tags: Array.from({ length: 25 }, (_, i) => `T${i}`) }).tags).toHaveLength(MAX_TAGS);
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
    const watched = { ...breakingBad, status: 'watched' as const, watchedAt: '2026-09-01T20:00:00.000Z', favorite: true, tags: ['Bad movie'] };
    const after = apply(watched, refreshPatch(fresh, fetchedAt));
    expect(after.imdbRating).toBe(9.6);
    expect(after.runtimeMin).toBe(47);
    expect(after.plot).toBe('Newer plot.');
    expect(after.posterUrl).toBe('https://m.media-amazon.com/images/M/new.jpg');
    expect(after.fetchedAt).toBe(fetchedAt);
    expect(after.status).toBe('watched');
    expect(after.watchedAt).toBe('2026-09-01T20:00:00.000Z');
    expect(after.favorite).toBe(true);
    expect(after.tags).toEqual(['Bad movie']);
    expect(after.createdBy).toBe(watched.createdBy);
    expect(after.id).toBe(watched.id);
  });

  it('writes exactly the refreshed fields, never status, watchedAt, the star or who added it', () => {
    const patch = refreshPatch({ ...fresh, status: 'to-watch', watchedAt: undefined, favorite: false, createdBy: 'm2' } as FetchedDetails, fetchedAt);
    expect(Object.keys(patch).sort()).toEqual([...REFRESHED_FIELDS].sort());
    for (const key of ['status', 'watchedAt', 'favorite', 'tags', 'createdBy', 'imdbId', 'kind', 'id', 'familyId', 'createdAt', 'updatedAt']) {
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
    // Unstarred by leaving it out: the backend's default, and absent counts as false.
    expect(row).not.toHaveProperty('favorite');
  });
});
