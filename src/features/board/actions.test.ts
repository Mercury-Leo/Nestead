import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalStore } from '../../data/local/localStore';
import type { DataStore } from '../../data/types';
import type { BoardColumn, NewRow, Task } from '../../domain/types';
import {
  CLEAR_AFTER_DAYS,
  autoClear,
  clearDone,
  completeTask,
  placeTask,
  reopenTask,
  restoreTask,
  reviveRecurring,
} from './actions';

const NOW = new Date(2026, 9, 10, 12); // 10 October 2026, noon local.
const DAY = 24 * 60 * 60 * 1000;

let store: DataStore;
let house: BoardColumn;
let errands: BoardColumn;

const addTask = (row: Partial<NewRow<Task>> = {}): Promise<Task> =>
  store.tasks.create({ title: 'Bins', columnId: house.id, position: 1000, done: false, ...row });

const reread = async (id: string): Promise<Task | undefined> => (await store.tasks.list()).find((row) => row.id === id);

beforeEach(async () => {
  localStorage.clear();
  store = createLocalStore('f-test');
  house = await store.columns.create({ name: 'House', position: 1000, isDone: false });
  errands = await store.columns.create({ name: 'Errands', position: 2000, isDone: false });
});

describe('completeTask', () => {
  it('ticks the task and writes a history entry copied from it', async () => {
    const task = await addTask({ icon: '🗑️', description: 'Green bin too', assigneeId: 'm-sam' });

    await completeTask(store, task, 'm-dana', NOW);

    const [entry] = await store.taskCompletions.list();
    expect(entry).toMatchObject({
      taskId: task.id,
      title: 'Bins',
      icon: '🗑️',
      description: 'Green bin too',
      columnId: house.id,
      assigneeId: 'm-sam',
      memberId: 'm-dana',
    });
    expect(await reread(task.id)).toMatchObject({ done: true, doneAt: NOW.toISOString(), completionId: entry?.id });
  });

  it('leaves a repeat\'s due date on the round it covered', async () => {
    const task = await addTask({ recurEveryDays: 7, recurFrom: '2026-10-03', dueDate: '2026-10-10' });

    await completeTask(store, task, 'm-dana', NOW);

    expect((await reread(task.id))?.dueDate).toBe('2026-10-10');
  });
});

describe('reopenTask', () => {
  it('unticks the task and removes only the entry that tick made', async () => {
    const task = await addTask();
    await completeTask(store, task, 'm-dana', new Date(2026, 9, 1));
    await reopenTask(store, (await reread(task.id))!);
    await completeTask(store, (await reread(task.id))!, 'm-dana', NOW);
    const older = await store.taskCompletions.create({ taskId: task.id, title: 'Bins' });

    await reopenTask(store, (await reread(task.id))!);

    const after = await reread(task.id);
    expect(after?.done).toBe(false);
    expect(after?.doneAt).toBeUndefined();
    expect(after?.completionId).toBeUndefined();
    expect((await store.taskCompletions.list()).map((row) => row.id)).toEqual([older.id]);
  });
});

describe('clearDone', () => {
  it('deletes done one-offs, keeps repeats and open tasks, and keeps the history', async () => {
    const parcel = await addTask({ title: 'Parcel' });
    const bins = await addTask({ title: 'Bins', recurEveryDays: 7, dueDate: '2026-10-10' });
    const open = await addTask({ title: 'Mop' });
    await completeTask(store, parcel, 'm-dana', NOW);
    await completeTask(store, bins, 'm-dana', NOW);
    const tasks = await store.tasks.list();

    await clearDone(store, tasks);

    expect((await store.tasks.list()).map((row) => row.title).sort()).toEqual(['Bins', 'Mop']);
    expect((await store.taskCompletions.list()).map((row) => row.title).sort()).toEqual(['Bins', 'Parcel']);
    expect((await reread(open.id))?.done).toBe(false);
  });
});

describe('autoClear', () => {
  it(`deletes done one-offs ticked more than ${CLEAR_AFTER_DAYS} days ago, and no others`, async () => {
    const old = await addTask({ title: 'Old', done: true, doneAt: new Date(NOW.getTime() - CLEAR_AFTER_DAYS * DAY - 60_000).toISOString() });
    await addTask({ title: 'Recent', done: true, doneAt: new Date(NOW.getTime() - CLEAR_AFTER_DAYS * DAY + 60_000).toISOString() });
    await addTask({ title: 'Repeat', done: true, recurEveryDays: 30, dueDate: '2026-09-01', doneAt: '2026-09-01T12:00:00.000Z' });
    await addTask({ title: 'Open' });

    const cleared = await autoClear(store, await store.tasks.list(), NOW);

    expect(cleared).toBe(1);
    expect((await store.tasks.list()).map((row) => row.title).sort()).toEqual(['Open', 'Recent', 'Repeat']);
    expect(await reread(old.id)).toBeUndefined();
  });
});

describe('reviveRecurring', () => {
  it('unticks a done repeat in its own column, with its next due date, once its return date arrives', async () => {
    const task = await addTask({
      columnId: errands.id,
      recurEveryDays: 7,
      recurFrom: '2026-09-26',
      dueDate: '2026-10-03',
      done: true,
      doneAt: new Date(2026, 9, 3, 9).toISOString(),
      completionId: 'entry-1',
    });

    expect(await reviveRecurring(store, await store.tasks.list(), NOW)).toBe(1);

    expect(await reread(task.id)).toMatchObject({ done: false, columnId: errands.id, dueDate: '2026-10-10', recurFrom: '2026-09-26' });
    expect((await reread(task.id))?.doneAt).toBeUndefined();
    expect((await reread(task.id))?.completionId).toBeUndefined();
  });

  it('leaves a repeat whose return date has not arrived', async () => {
    await addTask({ recurEveryDays: 7, recurFrom: '2026-10-10', dueDate: '2026-10-10', done: true, doneAt: NOW.toISOString() });

    expect(await reviveRecurring(store, await store.tasks.list(), NOW)).toBe(0);
  });
});

describe('restoreTask', () => {
  it('unticks a task still on the board and keeps every entry', async () => {
    const task = await addTask();
    await completeTask(store, task, 'm-dana', NOW);
    const [entry] = await store.taskCompletions.list();

    const result = await restoreTask(store, entry!, {
      tasks: await store.tasks.list(),
      columns: [house, errands],
      entries: await store.taskCompletions.list(),
      memberId: 'm-sam',
    });

    expect(result).toEqual({ taskId: task.id, column: house });
    expect(await reread(task.id)).toMatchObject({ done: false });
    expect((await reread(task.id))?.completionId).toBeUndefined();
    expect(await store.taskCompletions.list()).toHaveLength(1);
  });

  it('does nothing for a task that is already open', async () => {
    const task = await addTask();
    const entry = await store.taskCompletions.create({ taskId: task.id, title: 'Bins', columnId: house.id });

    const result = await restoreTask(store, entry, { tasks: [task], columns: [house, errands], entries: [entry], memberId: 'm-sam' });

    expect(result).toEqual({ taskId: task.id, column: house });
    expect(await store.tasks.list()).toHaveLength(1);
  });

  it('re-creates a cleared task at the end of its column and points all its entries at it', async () => {
    await addTask({ title: 'Mop', position: 5000 });
    const gone = await store.taskCompletions.create({
      taskId: 'cleared-task', title: 'Parcel', icon: '📦', description: 'Blue box', columnId: house.id, assigneeId: 'm-sam', memberId: 'm-dana',
    });
    const earlier = await store.taskCompletions.create({ taskId: 'cleared-task', title: 'Parcel', columnId: house.id });
    const other = await store.taskCompletions.create({ taskId: 'another', title: 'Bins', columnId: house.id });

    const result = await restoreTask(store, gone, {
      tasks: await store.tasks.list(),
      columns: [house, errands],
      entries: await store.taskCompletions.list(),
      memberId: 'm-dana',
    });

    const created = (await store.tasks.list()).find((row) => row.title === 'Parcel');
    expect(created).toMatchObject({
      icon: '📦', description: 'Blue box', columnId: house.id, assigneeId: 'm-sam', done: false, createdBy: 'm-dana',
    });
    expect(created!.position).toBeGreaterThan(5000);
    expect(result).toEqual({ taskId: created!.id, column: house });
    const byId = new Map((await store.taskCompletions.list()).map((row) => [row.id, row.taskId]));
    expect(byId.get(gone.id)).toBe(created!.id);
    expect(byId.get(earlier.id)).toBe(created!.id);
    expect(byId.get(other.id)).toBe('another');
  });

  it('uses the first column when the task\'s column is gone, and refuses with no columns at all', async () => {
    const entry = await store.taskCompletions.create({ taskId: 'cleared-task', title: 'Parcel', columnId: 'deleted-column' });

    const result = await restoreTask(store, entry, { tasks: [], columns: [errands, house], entries: [entry], memberId: 'm-dana' });
    expect(result?.column.id).toBe(errands.id);

    expect(await restoreTask(store, entry, { tasks: [], columns: [], entries: [entry], memberId: 'm-dana' })).toBeNull();
  });
});

describe('placeTask', () => {
  it('moves a task and its position, leaving done alone', async () => {
    const task = await addTask({ done: true, doneAt: NOW.toISOString() });

    await placeTask(store, task, errands, 500);

    expect(await reread(task.id)).toMatchObject({ columnId: errands.id, position: 500, done: true });
  });
});
