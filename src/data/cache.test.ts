import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../domain/types';
import { CachedCollection, withCache } from './cache';
import { runDataStoreContract } from './collection.contract';
import { createLocalStore } from './local/localStore';
import type { ChangeListener, Collection } from './types';

// The cache must be invisible: a cached backend passes the same contract.
runDataStoreContract('local, cached', (familyId) => withCache(createLocalStore(familyId)), () => {
  localStorage.clear();
});

function task(id: string, title: string, updatedAt = '2026-09-27T10:00:00.000Z'): Task {
  return {
    id,
    familyId: 'f',
    createdAt: '2026-09-27T10:00:00.000Z',
    updatedAt,
    title,
    columnId: 'c',
    position: 1000,
    done: false,
  };
}

/**
 * A backend whose reads and writes wait until the test lets them finish, so
 * the order things land in is the test's to choose.
 */
function controlledSource(initial: Task[]) {
  let rows = initial;
  const reads: Array<{ resolve: (rows: Task[]) => void; reject: (error: Error) => void }> = [];
  const writes: Array<{ succeed: () => void; fail: () => void }> = [];
  const listeners = new Set<ChangeListener>();

  const later = <R>(result: () => R): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      writes.push({ succeed: () => resolve(result()), fail: () => reject(new Error('refused')) });
    });

  const source: Collection<Task> = {
    list: vi.fn(() => new Promise<Task[]>((resolve, reject) => reads.push({ resolve, reject }))),
    create: vi.fn(),
    update: vi.fn((id: string, patch) =>
      later(() => {
        rows = rows.map((row) => (row.id === id ? { ...row, ...patch, updatedAt: '2026-09-27T11:00:00.000Z' } : row));
        return rows.find((row) => row.id === id) as Task;
      }),
    ),
    remove: vi.fn((id: string) =>
      later(() => {
        rows = rows.filter((row) => row.id !== id);
      }),
    ),
    subscribe: vi.fn((listener: ChangeListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };

  return {
    source,
    /** Finishes the oldest outstanding read with the backend's rows as they are now. */
    finishRead: async (snapshot: Task[] = rows) => {
      reads.shift()?.resolve(snapshot);
      await flush();
    },
    /** Fails the oldest outstanding read, as a dropped connection would. */
    failRead: async () => {
      reads.shift()?.reject(new Error('Failed to fetch'));
      await flush();
    },
    pendingReads: () => reads.length,
    finishWrite: async (ok = true) => {
      const write = writes.shift();
      if (ok) write?.succeed();
      else write?.fail();
      await flush();
    },
    notify: () => listeners.forEach((listener) => listener()),
    rows: () => rows,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

const titles = (cache: CachedCollection<Task>): string[] => cache.getSnapshot().rows.map((row) => row.title);

describe('CachedCollection', () => {
  it('reads once however many watch, and is not loaded until then', async () => {
    const backend = controlledSource([task('1', 'Bins')]);
    const cache = new CachedCollection(backend.source);

    cache.subscribe(() => undefined);
    cache.subscribe(() => undefined);
    expect(cache.getSnapshot().loaded).toBe(false);

    await backend.finishRead();

    expect(backend.source.list).toHaveBeenCalledTimes(1);
    expect(cache.getSnapshot()).toEqual({ rows: [task('1', 'Bins')], loaded: true, failed: false });
  });

  it('queues one more read for changes during a read, however many arrive', async () => {
    const backend = controlledSource([task('1', 'Bins')]);
    const cache = new CachedCollection(backend.source);
    cache.subscribe(() => undefined);

    backend.notify();
    backend.notify();
    backend.notify();
    await backend.finishRead();
    await backend.finishRead();

    expect(backend.source.list).toHaveBeenCalledTimes(2);
    expect(backend.pendingReads()).toBe(0);
  });

  it('shows an update at once and keeps what the backend returns', async () => {
    const backend = controlledSource([task('1', 'Bins')]);
    const cache = new CachedCollection(backend.source);
    cache.subscribe(() => undefined);
    await backend.finishRead();

    const done = cache.update('1', { title: 'Recycling' });
    expect(titles(cache)).toEqual(['Recycling']);

    await backend.finishWrite();
    await done;
    expect(cache.getSnapshot().rows[0]?.updatedAt).toBe('2026-09-27T11:00:00.000Z');
  });

  it('clears a field patched to undefined, as the backends do', async () => {
    const backend = controlledSource([{ ...task('1', 'Bins'), icon: '🗑️' }]);
    const cache = new CachedCollection(backend.source);
    cache.subscribe(() => undefined);
    await backend.finishRead();

    void cache.update('1', { icon: undefined });

    expect('icon' in (cache.getSnapshot().rows[0] as Task)).toBe(false);
  });

  it('puts the rows back when the backend refuses a write, and still rejects', async () => {
    const backend = controlledSource([task('1', 'Bins'), task('2', 'Dishes')]);
    const cache = new CachedCollection(backend.source);
    cache.subscribe(() => undefined);
    await backend.finishRead();

    const update = cache.update('1', { title: 'Recycling' });
    const remove = cache.remove('2');
    expect(titles(cache)).toEqual(['Recycling']);

    await backend.finishWrite(false);
    await backend.finishWrite(false);

    await expect(update).rejects.toThrow('refused');
    await expect(remove).rejects.toThrow('refused');
    expect(titles(cache)).toEqual(['Bins', 'Dishes']);
  });

  it('keeps a pending edit on top of a read that lands before the write does', async () => {
    const backend = controlledSource([task('1', 'Bins')]);
    const cache = new CachedCollection(backend.source);
    cache.subscribe(() => undefined);
    await backend.finishRead();

    void cache.update('1', { title: 'Recycling' });
    backend.notify(); // someone else changed something
    await backend.finishRead([task('1', 'Bins'), task('2', 'Dishes', '2026-09-27T10:30:00.000Z')]);

    expect(titles(cache)).toEqual(['Recycling', 'Dishes']);
  });

  it('does not let a read from before a confirmed write undo it', async () => {
    const backend = controlledSource([task('1', 'Bins')]);
    const cache = new CachedCollection(backend.source);
    cache.subscribe(() => undefined);
    await backend.finishRead();

    backend.notify(); // a read starts now, before the write below
    const before = [...backend.rows()];
    const update = cache.update('1', { title: 'Recycling' });
    await backend.finishWrite();
    await update;

    await backend.finishRead(before); // the old read lands late, without the write
    expect(titles(cache)).toEqual(['Recycling']);
    expect(backend.pendingReads()).toBe(0);
  });

  it("keeps somebody else's later change over our own confirmed write", async () => {
    const backend = controlledSource([task('1', 'Bins')]);
    const cache = new CachedCollection(backend.source);
    cache.subscribe(() => undefined);
    await backend.finishRead();

    backend.notify();
    const update = cache.update('1', { title: 'Recycling' }); // confirmed at 11:00
    await backend.finishWrite();
    await update;

    await backend.finishRead([task('1', 'Compost', '2026-09-27T12:00:00.000Z')]);
    expect(titles(cache)).toEqual(['Compost']);
  });

  it('does not bring back a row removed while a read was out', async () => {
    const backend = controlledSource([task('1', 'Bins'), task('2', 'Dishes')]);
    const cache = new CachedCollection(backend.source);
    cache.subscribe(() => undefined);
    await backend.finishRead();

    backend.notify();
    const before = [...backend.rows()];
    const remove = cache.remove('2');
    await backend.finishWrite();
    await remove;

    await backend.finishRead(before);
    expect(titles(cache)).toEqual(['Bins']);
  });

  it('keeps rows for the next screen, re-reading behind them', async () => {
    vi.useFakeTimers();
    try {
      const backend = controlledSource([task('1', 'Bins')]);
      const cache = new CachedCollection(backend.source);
      const stop = cache.subscribe(() => undefined);
      await backend.finishRead();
      stop();

      vi.advanceTimersByTime(60_000); // long enough to stop listening
      expect(backend.source.subscribe).toHaveBeenCalledTimes(1);

      cache.subscribe(() => undefined);
      expect(cache.getSnapshot()).toEqual({ rows: [task('1', 'Bins')], loaded: true, failed: false });
      expect(backend.source.list).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('when a read fails', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('is not loaded, says so, and reads again until one lands', async () => {
      const backend = controlledSource([task('1', 'Bins')]);
      const cache = new CachedCollection(backend.source);
      cache.subscribe(() => undefined);

      await backend.failRead();
      // Not an empty table: the screen must not show its empty state.
      expect(cache.getSnapshot()).toEqual({ rows: [], loaded: false, failed: true });

      vi.advanceTimersByTime(1_000);
      expect(backend.source.list).toHaveBeenCalledTimes(2);
      await backend.finishRead();
      expect(cache.getSnapshot()).toEqual({ rows: [task('1', 'Bins')], loaded: true, failed: false });
    });

    it('waits longer after each failure in a row', async () => {
      const backend = controlledSource([]);
      const cache = new CachedCollection(backend.source);
      cache.subscribe(() => undefined);

      await backend.failRead();
      vi.advanceTimersByTime(999);
      expect(backend.source.list).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(backend.source.list).toHaveBeenCalledTimes(2);

      await backend.failRead();
      vi.advanceTimersByTime(1_999);
      expect(backend.source.list).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      expect(backend.source.list).toHaveBeenCalledTimes(3);
    });

    it('reads at once on Try again, showing Loading until that read lands or fails', async () => {
      const backend = controlledSource([task('1', 'Bins')]);
      const cache = new CachedCollection(backend.source);
      cache.subscribe(() => undefined);
      await backend.failRead();

      cache.retry();
      expect(backend.source.list).toHaveBeenCalledTimes(2);
      expect(cache.getSnapshot()).toEqual({ rows: [], loaded: false, failed: false });

      await backend.failRead();
      expect(cache.getSnapshot().failed).toBe(true);
    });

    it('keeps the rows it had when a later read fails', async () => {
      const backend = controlledSource([task('1', 'Bins')]);
      const cache = new CachedCollection(backend.source);
      cache.subscribe(() => undefined);
      await backend.finishRead();

      backend.notify();
      await backend.failRead();
      expect(cache.getSnapshot()).toEqual({ rows: [task('1', 'Bins')], loaded: true, failed: true });

      vi.advanceTimersByTime(1_000);
      await backend.finishRead();
      expect(cache.getSnapshot()).toEqual({ rows: [task('1', 'Bins')], loaded: true, failed: false });
    });

    it('reads again at once when the browser comes back online or the tab is shown', async () => {
      const backend = controlledSource([]);
      const cache = new CachedCollection(backend.source);
      cache.subscribe(() => undefined);

      await backend.failRead();
      window.dispatchEvent(new Event('online'));
      expect(backend.source.list).toHaveBeenCalledTimes(2);

      await backend.failRead();
      document.dispatchEvent(new Event('visibilitychange'));
      expect(backend.source.list).toHaveBeenCalledTimes(3);
    });

    it('stops trying once nobody is watching', async () => {
      const backend = controlledSource([]);
      const cache = new CachedCollection(backend.source);
      const stop = cache.subscribe(() => undefined);
      await backend.failRead();
      stop();

      vi.advanceTimersByTime(60_000); // one retry, then long enough to close
      expect(backend.source.list).toHaveBeenCalledTimes(2);
      await backend.failRead();
      vi.advanceTimersByTime(600_000);
      window.dispatchEvent(new Event('online'));
      expect(backend.source.list).toHaveBeenCalledTimes(2);
    });
  });
});
