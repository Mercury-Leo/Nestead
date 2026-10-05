import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import { addShow, cycleStatus, dropShow, fillGenres, refreshShow, restoreShow } from './actions';
import type { lookupShow } from './client';

const INCEPTION = { imdbId: 'tt1375666', kind: 'movie' as const, title: 'Inception', year: 2010, runtimeMin: 148, imdbRating: 8.8 };

let store: DataStore;
beforeEach(() => {
  localStorage.clear();
  store = createLocalStore('f-shows');
});

describe('addShow', () => {
  it('adds a show To watch, by the member who added it', async () => {
    const { show, existed } = await addShow(store, [], INCEPTION, 'm1');
    expect(existed).toBe(false);
    expect(show).toMatchObject({ ...INCEPTION, status: 'to-watch', createdBy: 'm1' });
    expect(await store.shows.list()).toHaveLength(1);
  });

  it('opens the one already on the list instead of adding it twice', async () => {
    const first = await addShow(store, [], INCEPTION, 'm1');
    const again = await addShow(store, await store.shows.list(), { ...INCEPTION, title: 'Inception (again)' }, 'm2');
    expect(again).toEqual({ show: first.show, existed: true });
    expect(await store.shows.list()).toHaveLength(1);
  });
});

describe('cycleStatus', () => {
  it('stamps watchedAt on Watched and clears it on the way round', async () => {
    let { show } = await addShow(store, [], INCEPTION, 'm1');
    show = await cycleStatus(store, show);
    expect(show.status).toBe('watching');
    show = await cycleStatus(store, show);
    expect(show.status).toBe('watched');
    expect(Number.isNaN(Date.parse(show.watchedAt ?? ''))).toBe(false);
    show = await cycleStatus(store, show);
    expect(show.status).toBe('to-watch');
    expect(show.watchedAt).toBeUndefined();
  });
});

describe('dropShow', () => {
  it('drops a watched show, clearing watchedAt, and its badge brings it back as To watch', async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    const watched = await cycleStatus(store, await cycleStatus(store, show));
    expect(watched.watchedAt).toBeDefined();
    const dropped = await dropShow(store, watched);
    expect(dropped.status).toBe('dropped');
    expect(dropped.watchedAt).toBeUndefined();
    const back = await cycleStatus(store, dropped);
    expect(back.status).toBe('to-watch');
  });

  it('is undone by Restore, back to To watch', async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    const restored = await restoreShow(store, await dropShow(store, show));
    expect(restored.status).toBe('to-watch');
    expect(restored.watchedAt).toBeUndefined();
  });
});

describe('refreshShow', () => {
  it("saves the newer details and keeps the family's status", async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    const watched = await cycleStatus(store, await cycleStatus(store, show));
    const lookup = vi.fn<typeof lookupShow>(async () => ({ ok: true, value: { ...INCEPTION, imdbRating: 8.9, plot: 'Newer.' } }));
    const result = await refreshShow(store, watched, lookup);
    expect(lookup).toHaveBeenCalledWith('tt1375666', true);
    expect(result.ok).toBe(true);
    const [stored] = await store.shows.list();
    expect(stored?.imdbRating).toBe(8.9);
    expect(stored?.plot).toBe('Newer.');
    expect(stored?.status).toBe('watched');
    expect(stored?.watchedAt).toBe(watched.watchedAt);
    expect(Date.parse(stored?.fetchedAt ?? '')).toBeGreaterThanOrEqual(Date.parse(show.fetchedAt));
  });

  it('writes nothing when the lookup fails, or answers about another title', async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    const before = await store.shows.list();
    for (const answer of [
      { ok: false as const, failure: 'limit' as const },
      { ok: false as const, failure: 'failed' as const },
      { ok: true as const, value: { ...INCEPTION, imdbId: 'tt0903747', title: 'Breaking Bad' } },
    ]) {
      const result = await refreshShow(store, show, vi.fn<typeof lookupShow>(async () => answer));
      expect(result.ok).toBe(false);
    }
    expect(await store.shows.list()).toEqual(before);
  });
});

describe('fillGenres', () => {
  /** Shows as they were saved before genres: no genres field at all. */
  async function older(count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await store.shows.create({ imdbId: `tt${2000000 + i}`, kind: 'movie', title: `Old ${i}`, fetchedAt: '2026-10-04T08:00:00.000Z', status: i === 0 ? 'watched' : 'to-watch' });
    }
  }
  const answers = (imdbId: string) => ({ ok: true as const, value: { imdbId, kind: 'movie' as const, title: `Read ${imdbId}`, genres: ['Action', 'Comedy'] } });

  it('reads each show without genres once, and saves them as a refresh would', async () => {
    await older(5);
    const { show: added } = await addShow(store, [], { ...INCEPTION, genres: ['Sci-Fi'] }, 'm1');
    const lookup = vi.fn<typeof lookupShow>(async (imdbId) => answers(imdbId));
    const progress: number[] = [];
    const result = await fillGenres(store, await store.shows.list(), (done) => progress.push(done), lookup);

    expect(result).toEqual({ done: 5 });
    expect(lookup).toHaveBeenCalledTimes(5);
    expect(lookup).not.toHaveBeenCalledWith(added.imdbId, expect.anything());
    expect(lookup.mock.calls.every(([, fresh]) => fresh === true)).toBe(true);
    expect(progress).toEqual([1, 2, 3, 4, 5]);
    const rows = await store.shows.list();
    expect(rows.filter((row) => row.id !== added.id).every((row) => row.genres?.join() === 'Action,Comedy' && row.title.startsWith('Read'))).toBe(true);
    expect(rows.find((row) => row.id === added.id)?.genres).toEqual(['Sci-Fi']);
    // The family's own fields stay.
    expect(rows.find((row) => row.imdbId === 'tt2000000')?.status).toBe('watched');
  });

  it("stops at the day's limit, and the rest stay without genres", async () => {
    await older(6);
    let calls = 0;
    const lookup = vi.fn<typeof lookupShow>(async (imdbId) => {
      calls += 1;
      return calls <= 2 ? answers(imdbId) : { ok: false, failure: 'limit' };
    });
    const result = await fillGenres(store, await store.shows.list(), undefined, lookup);
    expect(result.failure).toBe('limit');
    expect(result.done).toBe(2);
    // Three at a time: the ones already asked finish, and nothing new is asked after the limit.
    expect(lookup.mock.calls.length).toBeLessThanOrEqual(5);
    expect((await store.shows.list()).filter((row) => row.genres === undefined)).toHaveLength(4);
  });

  it('saves an empty list for a title the service no longer has, and skips one that fails', async () => {
    await older(3);
    const lookup = vi.fn<typeof lookupShow>(async (imdbId) =>
      imdbId === 'tt2000000' ? { ok: false, failure: 'not-found' } : imdbId === 'tt2000001' ? { ok: false, failure: 'failed' } : answers(imdbId),
    );
    const result = await fillGenres(store, await store.shows.list(), undefined, lookup);
    expect(result).toEqual({ done: 3, failure: 'failed' });
    const byId = new Map((await store.shows.list()).map((row) => [row.imdbId, row]));
    expect(byId.get('tt2000000')?.genres).toEqual([]);
    expect(byId.get('tt2000000')?.title).toBe('Old 0');
    expect(byId.get('tt2000001')?.genres).toBeUndefined();
    expect(byId.get('tt2000002')?.genres).toEqual(['Action', 'Comedy']);
  });

  it('asks nothing when every show has genres', async () => {
    await addShow(store, [], { ...INCEPTION, genres: [] }, 'm1');
    const lookup = vi.fn<typeof lookupShow>();
    expect(await fillGenres(store, await store.shows.list(), undefined, lookup)).toEqual({ done: 0 });
    expect(lookup).not.toHaveBeenCalled();
  });
});
