import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../auth/session';
import type { Session } from '../../auth/session';
import { createLocalStore, writePreference } from '../../data/local/localStore';
import type { DataStore } from '../../data/types';
import type { BoardColumn, Member, NewRow, Task } from '../../domain/types';
import { LocaleProvider, i18n } from '../../i18n';
import { Board } from './Board';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dana: Member = { id: 'm-dana', familyId: 'f-test', name: 'Dana', color: '#1d9e75', createdAt: '', updatedAt: '' };

let store: DataStore;
let house: BoardColumn;
let unmount: (() => void) | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(): Promise<HTMLElement> {
  const session: Session = { store, me: dana, members: [dana], signOut: async () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <SessionContext.Provider value={session}>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Board />
          </MemoryRouter>
        </SessionContext.Provider>
      </LocaleProvider>,
    );
  });
  await flush();
  await flush();
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

async function click(element: Element | null | undefined): Promise<void> {
  expect(element).toBeTruthy();
  await act(async () => {
    (element as HTMLElement).click();
  });
  await flush();
  await flush();
}

const addTask = (row: Partial<NewRow<Task>> = {}): Promise<Task> =>
  store.tasks.create({ title: 'Bins', icon: '🗑️', columnId: house.id, position: 1000, done: false, ...row });

const tick = (host: ParentNode, title: string): HTMLButtonElement | null =>
  host.querySelector(`button[role="checkbox"][aria-label="${i18n.t('board.card.done', { title })}"]`);

beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
});

beforeEach(async () => {
  localStorage.clear();
  store = createLocalStore('f-test');
  house = await store.columns.create({ name: 'House', position: 1000 });
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.restoreAllMocks();
});

describe('the tick', () => {
  it('is a checkbox named after the task, and ticking writes the task and its history', async () => {
    await addTask();
    const host = await render();

    const box = tick(host, 'Bins');
    expect(box?.getAttribute('aria-checked')).toBe('false');
    await click(box);

    const [task] = await store.tasks.list();
    expect(task?.done).toBe(true);
    expect(task?.doneAt).toBeDefined();
    const [entry] = await store.taskCompletions.list();
    expect(entry).toMatchObject({ taskId: task?.id, title: 'Bins', memberId: 'm-dana' });
    // The ticked card moves into the column's Done fold, which starts closed.
    expect(tick(host, 'Bins')).toBeNull();
    await click(toggle(host));
    expect(tick(host, 'Bins')?.getAttribute('aria-checked')).toBe('true');
  });

  it('unticking removes the entry the tick made', async () => {
    await addTask();
    const host = await render();
    await click(tick(host, 'Bins'));
    await click(toggle(host));

    await click(tick(host, 'Bins'));

    expect((await store.tasks.list())[0]?.done).toBe(false);
    expect(await store.taskCompletions.list()).toEqual([]);
  });

  it('ignores a second press while a tick is on its way, so a double tap makes one entry', async () => {
    await addTask();
    // The history write waits until the test lets it through, like a slow backend.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = store.taskCompletions.create.bind(store.taskCompletions);
    vi.spyOn(store.taskCompletions, 'create').mockImplementation(async (row) => {
      await gate;
      return create(row);
    });
    const update = vi.spyOn(store.tasks, 'update');
    const host = await render();
    const box = tick(host, 'Bins')!;

    // Both presses land before the first tick has written anything.
    await act(async () => {
      box.click();
      box.click();
    });
    expect(box.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      release();
      await vi.waitFor(async () => expect((await store.tasks.list())[0]?.done).toBe(true));
    });
    await flush();

    const entries = await store.taskCompletions.list();
    expect(entries).toHaveLength(1);
    expect(update.mock.calls.filter(([, patch]) => patch.done === true)).toHaveLength(1);
    expect((await store.tasks.list())[0]?.completionId).toBe(entries[0]?.id);
  });

  it('comes back, with no unhandled rejection, when a tick fails', async () => {
    await addTask();
    vi.spyOn(store.taskCompletions, 'create').mockRejectedValueOnce(new Error('offline'));
    const host = await render();

    await click(tick(host, 'Bins'));

    expect(tick(host, 'Bins')?.getAttribute('aria-busy')).toBeNull();
    expect((await store.tasks.list())[0]?.done).toBe(false);
    // And the next press works.
    await click(tick(host, 'Bins'));
    expect((await store.tasks.list())[0]?.done).toBe(true);
  });

  it('shows a plain tick for a task with no emoji', async () => {
    await addTask({ icon: undefined });
    const host = await render();

    expect(tick(host, 'Bins')?.querySelector('.card-tick-plain')).not.toBeNull();
    expect(tick(host, 'Bins')?.querySelector('.card-tick-badge')).toBeNull();
  });

  it('leaves done cards out of the drag targets', async () => {
    await addTask({ title: 'Open' });
    await addTask({ title: 'Done', done: true, doneAt: new Date().toISOString() });
    const host = await render();

    expect([...host.querySelectorAll('[data-task-id]')].map((node) => node.textContent)).toEqual([expect.stringContaining('Open')]);
  });
});

/** Minutes ago, as an ISO timestamp: recent enough that the board's auto-clear leaves it alone. */
const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
const toggle = (host: ParentNode): HTMLButtonElement | undefined =>
  [...host.querySelectorAll<HTMLButtonElement>('button.done-toggle')][0];
const titles = (host: ParentNode, selector: string): string[] =>
  [...host.querySelectorAll(`${selector} .card-title`)].map((node) => node.textContent ?? '');
const buttonNamed = (host: ParentNode, name: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((node) => node.textContent === name);

describe('the Done fold', () => {
  it('is absent while nothing in the column is done', async () => {
    await addTask();
    const host = await render();

    expect(toggle(host)).toBeUndefined();
  });

  it('holds done cards, closed, counts them, and the header counts open cards only', async () => {
    await addTask({ title: 'Mop' });
    await addTask({ title: 'Parcel', done: true, doneAt: ago(90) });
    await addTask({ title: 'Bins', done: true, doneAt: ago(5) });
    const host = await render();

    expect(toggle(host)?.textContent).toBe(i18n.t('board.done.toggle', { count: 2 }));
    expect(toggle(host)?.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.column-count')?.textContent).toBe('1');
    expect(titles(host, '.done-fold')).toEqual([]);

    await click(toggle(host));

    expect(titles(host, '.done-fold')).toEqual(['Bins', 'Parcel']);
  });

  it('Clear asks first, then deletes the done one-offs and keeps the repeats and the history', async () => {
    const parcel = await addTask({ title: 'Parcel' });
    await addTask({ title: 'Bins', recurEveryDays: 7, dueDate: '2026-10-10' });
    const host = await render();
    await click(tick(host, 'Parcel'));
    await click(tick(host, 'Bins'));
    await click(toggle(host));

    await click(buttonNamed(host, i18n.t('board.done.clear')));
    expect(host.textContent).toContain(i18n.t('board.done.clearQuestion', { count: 1 }));
    expect(await store.tasks.list()).toHaveLength(2);

    await click(host.querySelector('.done-fold .danger-solid'));

    expect((await store.tasks.list()).map((row) => row.title)).toEqual(['Bins']);
    expect((await store.taskCompletions.list()).map((row) => row.taskId)).toContain(parcel.id);
  });

  it('applies the search to the fold too', async () => {
    await addTask({ title: 'Parcel', done: true, doneAt: ago(90) });
    await addTask({ title: 'Bins', done: true, doneAt: ago(5) });
    writePreference('f-test', 'boardFilter', { query: 'parc', assignee: '' });
    const host = await render();
    await click(toggle(host));

    expect(toggle(host)?.textContent).toBe(i18n.t('board.done.toggle', { count: 1 }));
    expect(titles(host, '.done-fold')).toEqual(['Parcel']);
  });
});
