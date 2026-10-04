import { describe, expect, it, vi } from 'vitest';
import { cacheOf } from '../data/cache';
import { createLocalStore } from '../data/local/localStore';
import { warmPage } from './warm';

/** How many times the Shows page's module was loaded. */
const loaded = vi.hoisted(() => ({ shows: 0 }));
vi.mock('../features/activities/shows/Shows', () => {
  loaded.shows += 1;
  return { Shows: () => null };
});

describe('warmPage', () => {
  it("starts the Shows page's code and its first read", async () => {
    const store = createLocalStore('f-warm');
    const list = vi.spyOn(store.shows, 'list');
    warmPage('/shows', store);
    expect(list).toHaveBeenCalledTimes(1);
    await vi.dynamicImportSettled();
    expect(loaded.shows).toBe(1);
    await vi.waitFor(() => expect(cacheOf(store.shows).getSnapshot().loaded).toBe(true));

    // Warming again while the rows are open reads nothing more.
    warmPage('/shows', store);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('leaves pages alone that sign-in already reads, or that have nothing to warm', () => {
    const store = createLocalStore('f-warm-other');
    const reads = [vi.spyOn(store.tasks, 'list'), vi.spyOn(store.recipes, 'list'), vi.spyOn(store.members, 'list')];
    for (const path of ['/', '/lists', '/library', '/family', '/nowhere']) warmPage(path, store);
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });
});
