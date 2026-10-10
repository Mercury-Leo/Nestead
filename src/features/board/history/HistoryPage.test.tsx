import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../../auth/session';
import type { Session } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import type { BoardColumn, Member } from '../../../domain/types';
import { LocaleProvider, i18n } from '../../../i18n';
import { HistoryPage } from './HistoryPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dana: Member = { id: 'm-dana', familyId: 'f-test', name: 'Dana', color: '#1d9e75', createdAt: '', updatedAt: '' };
const sam: Member = { id: 'm-sam', familyId: 'f-test', name: 'Sam', color: '#d85a30', createdAt: '', updatedAt: '' };

let store: DataStore;
let house: BoardColumn;
let unmount: (() => void) | null = null;
let landed: { pathname: string; state: unknown } | null = null;

function Spy(): null {
  const location = useLocation();
  landed = { pathname: location.pathname, state: location.state };
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(): Promise<HTMLElement> {
  const session: Session = { store, me: dana, members: [dana, sam], signOut: async () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <SessionContext.Provider value={session}>
          <MemoryRouter initialEntries={['/history']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/" element={<Spy />} />
            </Routes>
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

beforeEach(async () => {
  localStorage.clear();
  landed = null;
  store = createLocalStore('f-test');
  house = await store.columns.create({ name: 'House', position: 1000 });
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.restoreAllMocks();
});

describe('HistoryPage', () => {
  it('says so when nothing has been done', async () => {
    const host = await render();

    expect(host.textContent).toContain(i18n.t('board.history.emptyTitle'));
  });

  it('lists entries under Today with who did them, and Someone for a backfilled one', async () => {
    const open = await store.tasks.create({ title: 'Mop', columnId: house.id, position: 1000, done: false });
    await store.taskCompletions.create({ taskId: open.id, title: 'Mop', columnId: house.id, memberId: 'm-sam' });
    await store.taskCompletions.create({ taskId: 'gone', title: 'Parcel', columnId: house.id });
    const host = await render();

    expect(host.querySelector('h2')?.textContent).toBe(i18n.t('board.history.today'));
    const rows = [...host.querySelectorAll('li')].map((row) => row.textContent ?? '');
    expect(rows.some((row) => row.includes('Mop') && row.includes('Sam') && row.includes(i18n.t('board.history.onBoard')))).toBe(true);
    expect(rows.some((row) => row.includes('Parcel') && row.includes(i18n.t('board.history.someone')))).toBe(true);
  });

  it("shows Load failed, never a list that could restore a task twice, while the board's tasks cannot be read", async () => {
    await store.taskCompletions.create({ taskId: 'a', title: 'Mop', memberId: 'm-sam' });
    vi.spyOn(store.tasks, 'list').mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = await render();

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Mop');
    expect(host.querySelector('button[aria-label^="' + i18n.t('board.history.restore') + '"]')).toBeNull();
  });

  it('ignores a second press while a Restore is under way, so a double tap makes one card', async () => {
    await store.taskCompletions.create({ taskId: 'gone', title: 'Parcel', columnId: house.id, memberId: 'm-dana' });
    const create = store.tasks.create.bind(store.tasks);
    vi.spyOn(store.tasks, 'create').mockImplementation(async (row) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return create(row);
    });
    const host = await render();
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('board.history.restoreTitle', { title: 'Parcel' })}"]`)!;

    // Both presses land before the first Restore has finished or the page has redrawn.
    await act(async () => {
      button.click();
      button.click();
    });
    expect(button.disabled).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(await store.tasks.list()).toHaveLength(1);
    expect(landed?.pathname).toBe('/');
  });

  it('brings the button back, with no unhandled rejection, when a Restore fails', async () => {
    await store.taskCompletions.create({ taskId: 'gone', title: 'Parcel', columnId: house.id, memberId: 'm-dana' });
    vi.spyOn(store.tasks, 'create').mockRejectedValueOnce(new Error('offline'));
    const host = await render();
    const label = i18n.t('board.history.restoreTitle', { title: 'Parcel' });

    await click(host.querySelector(`button[aria-label="${label}"]`));

    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(button?.disabled).toBe(false);
    expect(landed).toBeNull();

    // And the next press works.
    await click(button);
    expect(await store.tasks.list()).toHaveLength(1);
    expect(landed?.pathname).toBe('/');
  });

  it('filters by who did it', async () => {
    await store.taskCompletions.create({ taskId: 'a', title: 'Mop', memberId: 'm-sam' });
    await store.taskCompletions.create({ taskId: 'b', title: 'Bins', memberId: 'm-dana' });
    const host = await render();
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${i18n.t('board.history.doneBy')}"]`)!;

    await act(async () => {
      select.value = 'm-dana';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const rows = [...host.querySelectorAll('li')].map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Bins');
  });

  it('restores a cleared task to its column and goes to the board with a note', async () => {
    await store.taskCompletions.create({ taskId: 'gone', title: 'Parcel', icon: '📦', columnId: house.id, memberId: 'm-dana' });
    const host = await render();

    await click(host.querySelector(`button[aria-label="${i18n.t('board.history.restoreTitle', { title: 'Parcel' })}"]`));

    const [task] = await store.tasks.list();
    expect(task).toMatchObject({ title: 'Parcel', icon: '📦', columnId: house.id, done: false });
    expect(landed?.pathname).toBe('/');
    expect(landed?.state).toEqual({ restored: { taskId: task?.id, title: 'Parcel', column: 'House' } });
  });
});
