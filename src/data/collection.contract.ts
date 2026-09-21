import { beforeEach, describe, expect, it } from 'vitest';
import type { NewRow, Task } from '../domain/types';
import type { DataStore } from './types';

/**
 * The contract every backend must satisfy. A new backend is "done" when it
 * passes these cases unchanged; only then does it earn a case in src/data/index.ts.
 *
 * @param name  Label for the test suite, e.g. "local".
 * @param make  Builds a store for the given family id.
 * @param reset Clears all persisted state between cases, if the backend has any.
 */
export function runDataStoreContract(
  name: string,
  make: (familyId: string) => DataStore,
  reset?: () => void,
): void {
  /** A valid task. The contract tests storage, not the board, so the column is arbitrary. */
  const newTask = (title: string): NewRow<Task> => ({
    title,
    columnId: 'column-1',
    position: 1000,
    done: false,
    createdBy: 'member-1',
  });

  describe(`DataStore contract: ${name}`, () => {
    const familyId = 'family-a';
    let store: DataStore;

    beforeEach(() => {
      reset?.();
      store = make(familyId);
    });

    it('create fills id, familyId and timestamps', async () => {
      const task = await store.tasks.create(newTask('Take the bins out'));

      expect(task.id).toMatch(/\S/);
      expect(task.familyId).toBe(familyId);
      expect(task.createdAt).toBe(task.updatedAt);
      expect(Number.isNaN(Date.parse(task.createdAt))).toBe(false);
      expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
      expect(task.title).toBe('Take the bins out');
    });

    it('list returns the rows that were created', async () => {
      const first = await store.tasks.create(newTask('One'));
      const second = await store.tasks.create(newTask('Two'));

      const rows = await store.tasks.list();

      expect(rows.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());
      expect(rows.map((row) => row.title).sort()).toEqual(['One', 'Two']);
    });

    it('update merges the patch, bumps updatedAt and keeps createdAt', async () => {
      const task = await store.tasks.create(newTask('Wash up'));

      const updated = await store.tasks.update(task.id, { done: true });

      expect(updated.id).toBe(task.id);
      expect(updated.title).toBe('Wash up');
      expect(updated.done).toBe(true);
      expect(updated.createdAt).toBe(task.createdAt);
      expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(task.updatedAt));

      const [stored] = await store.tasks.list();
      expect(stored).toEqual(updated);
    });

    it('update rejects for an unknown id', async () => {
      await expect(store.tasks.update('no-such-id', { done: true })).rejects.toThrow();
    });

    it('remove deletes the row', async () => {
      const keep = await store.tasks.create(newTask('Keep'));
      const drop = await store.tasks.create(newTask('Drop'));

      await store.tasks.remove(drop.id);

      const rows = await store.tasks.list();
      expect(rows.map((row) => row.id)).toEqual([keep.id]);
    });

    it('subscribe fires on create, update and remove, and stops after unsubscribe', async () => {
      let changes = 0;
      const unsubscribe = store.tasks.subscribe(() => {
        changes += 1;
      });

      const task = await store.tasks.create(newTask('Hoover'));
      expect(changes).toBe(1);

      await store.tasks.update(task.id, { done: true });
      expect(changes).toBe(2);

      await store.tasks.remove(task.id);
      expect(changes).toBe(3);

      unsubscribe();
      await store.tasks.create(newTask('After unsubscribe'));
      expect(changes).toBe(3);
    });

    it("two families never see each other's rows", async () => {
      const other = make('family-b');

      const mine = await store.tasks.create(newTask('Mine'));
      const theirs = await other.tasks.create(newTask('Theirs'));

      const myRows = await store.tasks.list();
      const theirRows = await other.tasks.list();

      expect(myRows.map((row) => row.id)).toEqual([mine.id]);
      expect(theirRows.map((row) => row.id)).toEqual([theirs.id]);
      expect(myRows.every((row) => row.familyId === familyId)).toBe(true);
      expect(theirRows.every((row) => row.familyId === 'family-b')).toBe(true);
    });
  });
}
