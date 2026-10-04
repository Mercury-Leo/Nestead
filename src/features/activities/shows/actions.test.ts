import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import { addShow, cycleStatus, dropShow, refreshShow, restoreShow, toggleFavorite } from './actions';
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

describe('toggleFavorite', () => {
  it('stars a show and unstars it again, leaving its status alone', async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    expect(show.favorite).toBeUndefined();
    const watching = await cycleStatus(store, show);
    const starred = await toggleFavorite(store, watching);
    expect(starred.favorite).toBe(true);
    expect(starred.status).toBe('watching');
    const unstarred = await toggleFavorite(store, starred);
    // false, not cleared: the backend's column is not null.
    expect(unstarred.favorite).toBe(false);
    expect((await store.shows.list())[0]?.favorite).toBe(false);
  });

  it('stays through a status change and a drop', async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    const starred = await toggleFavorite(store, show);
    expect((await cycleStatus(store, starred)).favorite).toBe(true);
    expect((await dropShow(store, starred)).favorite).toBe(true);
  });
});

describe('refreshShow', () => {
  it("saves OMDb's newer details and keeps the family's status and star", async () => {
    const { show } = await addShow(store, [], INCEPTION, 'm1');
    const watched = await toggleFavorite(store, await cycleStatus(store, await cycleStatus(store, show)));
    const lookup = vi.fn<typeof lookupShow>(async () => ({ ok: true, value: { ...INCEPTION, imdbRating: 8.9, plot: 'Newer.' } }));
    const result = await refreshShow(store, watched, lookup);
    expect(lookup).toHaveBeenCalledWith('tt1375666', true);
    expect(result.ok).toBe(true);
    const [stored] = await store.shows.list();
    expect(stored?.imdbRating).toBe(8.9);
    expect(stored?.plot).toBe('Newer.');
    expect(stored?.status).toBe('watched');
    expect(stored?.watchedAt).toBe(watched.watchedAt);
    expect(stored?.favorite).toBe(true);
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
