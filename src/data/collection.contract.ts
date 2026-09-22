import { beforeEach, describe, expect, it } from 'vitest';
import type { NewRow, Task } from '../domain/types';
import type { DataStore } from './types';

/**
 * The contract every backend must satisfy. A new backend is "done" when it
 * passes these cases unchanged; only then does it earn a case in src/data/index.ts.
 *
 * Three things this contract deliberately does NOT require, because the
 * Collection interface never promised them and demanding them would only
 * describe localStorage:
 *
 *   * that a family label is the stored familyId. Rows are checked against
 *     store.familyId, so a backend whose ids come from the database passes.
 *   * that notifications are synchronous or exactly one per change. A change
 *     must produce at least one notification, eventually.
 *   * that reset() clears anything in particular, only that cases start from a
 *     state where the store's collections are empty.
 *
 * @param name  Label for the test suite, e.g. "local".
 * @param make  Builds a store for the given family label. The label picks
 *              WHICH family, and need not be the id the backend stores. It
 *              must return a store
 *              whose caller is genuinely authorised for that family, not one
 *              that merely claims the id. A backend with real auth therefore
 *              signs in as a user belonging to that family, which is why this
 *              may be async: under RLS a client cannot simply assert a family.
 * @param reset Clears all persisted state between cases, if the backend has any.
 */
/** Polls until the predicate holds, so async backends are not raced. */
async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for a change notification');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Long enough for a stray notification to arrive, if one were coming. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export function runDataStoreContract(
  name: string,
  make: (familyId: string) => DataStore | Promise<DataStore>,
  reset?: () => void | Promise<void>,
): void {
  describe(`DataStore contract: ${name}`, () => {
    const familyId = 'family-a';
    let store: DataStore;
    let columnId: string;

    /**
     * A valid task. columnId must be a real column: a backend with foreign keys
     * rejects an invented one, so the contract cannot use a placeholder.
     * Attribution is left off because created_by references members, and this
     * contract is about storage rather than people.
     */
    const newTask = (title: string): NewRow<Task> => ({
      title,
      columnId,
      position: 1000,
      done: false,
    });

    const aColumn = async (from: DataStore = store): Promise<string> => {
      const column = await from.columns.create({ name: 'To do', position: 1000, isDone: false });
      return column.id;
    };

    beforeEach(async () => {
      await reset?.();
      store = await make(familyId);
      columnId = await aColumn();
    });

    it('create fills id, familyId and timestamps', async () => {
      const task = await store.tasks.create(newTask('Take the bins out'));

      expect(task.id).toMatch(/\S/);
      expect(task.familyId).toBe(store.familyId);
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

    it('update with an undefined field clears it', async () => {
      const task = await store.tasks.create({ ...newTask('Feed the cat'), icon: '🐱' });

      const updated = await store.tasks.update(task.id, { icon: undefined });

      expect(updated.icon).toBeUndefined();
      const [stored] = await store.tasks.list();
      expect(stored.icon).toBeUndefined();
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

      // A backend that notifies locally AND echoes the change back over a
      // realtime channel reports more than one per write. That is fine: a
      // listener re-reads, so duplicates are idempotent. What matters is that
      // every change produces at least one notification.
      let seen = 0;
      const changed = async (): Promise<void> => {
        await waitFor(() => changes > seen);
        seen = changes;
      };

      const task = await store.tasks.create(newTask('Hoover'));
      await changed();

      await store.tasks.update(task.id, { done: true });
      await changed();

      await store.tasks.remove(task.id);
      await changed();

      unsubscribe();
      await store.tasks.create(newTask('After unsubscribe'));
      await settle();
      expect(changes).toBe(seen);
    });

    it("two families never see each other's rows", async () => {
      const other = await make('family-b');
      const theirColumnId = await aColumn(other);

      const mine = await store.tasks.create(newTask('Mine'));
      const theirs = await other.tasks.create({
        title: 'Theirs',
        columnId: theirColumnId,
        position: 1000,
        done: false,
      });

      const myRows = await store.tasks.list();
      const theirRows = await other.tasks.list();

      expect(store.familyId).not.toBe(other.familyId);
      expect(myRows.map((row) => row.id)).toEqual([mine.id]);
      expect(theirRows.map((row) => row.id)).toEqual([theirs.id]);
      expect(myRows.every((row) => row.familyId === store.familyId)).toBe(true);
      expect(theirRows.every((row) => row.familyId === other.familyId)).toBe(true);
    });
  });
}
