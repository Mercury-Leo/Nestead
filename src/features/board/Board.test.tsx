import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionContext } from '../../auth/session';
import type { Session } from '../../auth/session';
import { createLocalStore } from '../../data/local/localStore';
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
    expect(tick(host, 'Bins')?.getAttribute('aria-checked')).toBe('true');
  });

  it('unticking removes the entry the tick made', async () => {
    await addTask();
    const host = await render();
    await click(tick(host, 'Bins'));

    await click(tick(host, 'Bins'));

    expect((await store.tasks.list())[0]?.done).toBe(false);
    expect(await store.taskCompletions.list()).toEqual([]);
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
