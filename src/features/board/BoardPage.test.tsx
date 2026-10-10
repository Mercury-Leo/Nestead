import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionContext } from '../../auth/session';
import type { Session } from '../../auth/session';
import { createLocalStore } from '../../data/local/localStore';
import type { DataStore } from '../../data/types';
import type { Member } from '../../domain/types';
import { LocaleProvider, i18n } from '../../i18n';
import { BoardPage } from './BoardPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dana: Member = { id: 'm-dana', familyId: 'f-test', name: 'Dana', color: '#1d9e75', createdAt: '', updatedAt: '' };
const sam: Member = { id: 'm-sam', familyId: 'f-test', name: 'Sam', color: '#d85a30', createdAt: '', updatedAt: '' };

let store: DataStore;
let unmount: (() => void) | null = null;
let state: unknown = 'unset';

function Spy(): null {
  state = useLocation().state;
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(locationState: unknown): Promise<HTMLElement> {
  const session: Session = { store, me: dana, members: [dana, sam], signOut: async () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <SessionContext.Provider value={session}>
          <MemoryRouter initialEntries={[{ pathname: '/', state: locationState }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <BoardPage />
            <Spy />
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

beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
});

beforeEach(() => {
  localStorage.clear();
  state = 'unset';
  store = createLocalStore('f-test');
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('BoardPage after a restore', () => {
  it('says where the task is back, outlines its card, and drops the note from the history entry', async () => {
    const errands = await store.columns.create({ name: 'Errands', position: 1000 });
    const parcel = await store.tasks.create({ title: 'Parcel', columnId: errands.id, position: 1000, done: false });
    await store.tasks.create({ title: 'Bins', columnId: errands.id, position: 2000, done: false });

    const host = await render({ restored: { taskId: parcel.id, title: 'Parcel', column: 'Errands' } });

    expect(host.querySelector('.board-note')?.textContent).toBe(i18n.t('board.restored', { title: 'Parcel', column: 'Errands' }));
    expect([...host.querySelectorAll('.card-highlight')].map((card) => card.textContent)).toEqual([expect.stringContaining('Parcel')]);
    // A reload would otherwise show the note again.
    expect(state).toBeNull();
  });

  it('shows no note when the board is opened any other way', async () => {
    const host = await render(null);

    expect(host.querySelector('.board-note')).toBeNull();
    expect(host.querySelector('.card-highlight')).toBeNull();
  });
});
