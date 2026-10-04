import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import { addShow, cycleStatus, refreshShow } from './actions';
import type { lookupShow } from './omdb';

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

describe('refreshShow', () => {
  it("saves OMDb's newer details and keeps the family's status", async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    const watched = await cycleStatus(store, await cycleStatus(store, show));
    const lookup = vi.fn<typeof lookupShow>(async () => ({ ok: true, value: { ...INCEPTION, imdbRating: 8.9, plot: 'Newer.' } }));
    const result = await refreshShow(store, watched, lookup);
    expect(lookup).toHaveBeenCalledWith('tt1375666');
    expect(result.ok).toBe(true);
    const [stored] = await store.shows.list();
    expect(stored?.imdbRating).toBe(8.9);
    expect(stored?.plot).toBe('Newer.');
    expect(stored?.status).toBe('watched');
    expect(stored?.watchedAt).toBe(watched.watchedAt);
    expect(Date.parse(stored?.fetchedAt ?? '')).toBeGreaterThanOrEqual(Date.parse(show.fetchedAt));
  });

  it('writes nothing when OMDb fails, or answers about another title', async () => {
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
