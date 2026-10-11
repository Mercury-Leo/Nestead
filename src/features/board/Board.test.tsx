import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../auth/session';
import type { Session } from '../../auth/session';
import { createLocalStore, readDevicePreference, writeDevicePreference, writePreference } from '../../data/local/localStore';
import type { DataStore } from '../../data/types';
import type { BoardColumn, Member, NewRow, Task } from '../../domain/types';
import { LocaleProvider, i18n } from '../../i18n';
import { Board } from './Board';
import { DEFAULT_TASK_ICON, TASK_ICONS, TASK_ICON_GROUPS } from './icons';

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

  it('reports a failed tidy on open with a warning, not an unhandled rejection', async () => {
    await addTask({ title: 'Parcel', done: true, doneAt: ago(8 * 24 * 60) });
    const offline = new Error('offline');
    vi.spyOn(store.tasks, 'remove').mockRejectedValue(offline);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await render();

    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.any(String), offline));
    expect(await store.tasks.list()).toHaveLength(1);
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

describe('the icon picker', () => {
  const openCard = (host: ParentNode, title: string): Promise<void> =>
    click([...host.querySelectorAll('button.card-toggle')].find((node) => node.textContent?.includes(title)));
  const cardNamed = (host: ParentNode, title: string): Element | undefined =>
    [...host.querySelectorAll('.card')].find((node) => node.querySelector('.card-title')?.textContent?.includes(title));
  const trigger = (root: ParentNode | undefined): HTMLButtonElement | null => root?.querySelector('button.icon-trigger') ?? null;
  // The choices float in <body>, outside the card.
  const panel = (): HTMLElement | null => document.querySelector('.icon-popover');
  const icons = (root: ParentNode, selector = '.icon-picker'): string[] =>
    [...root.querySelectorAll(`${selector} .icon-grid button`)].map((node) => node.textContent ?? '');
  const iconButton = (root: ParentNode, icon: string): HTMLButtonElement | undefined =>
    [...root.querySelectorAll<HTMLButtonElement>('.icon-grid button')].find((node) => node.textContent === icon);
  const moreToggle = (root: ParentNode): HTMLButtonElement | null => root.querySelector('button.icon-more-toggle');
  const recentRow = (root: ParentNode): Element | null => root.querySelector('.icon-picker > .icon-section');

  it('opens the icons in a floating panel, not in the card, and the rest by group behind More icons', async () => {
    await addTask();
    const host = await render();
    await openCard(host, 'Bins');
    const card = cardNamed(host, 'Bins');

    expect(card?.querySelector('.icon-grid')).toBeNull();
    const button = trigger(card);
    expect(button?.textContent).toBe('🗑️');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    // Named by its row's label and the icon: "Icon 🗑️".
    const name = (button?.getAttribute('aria-labelledby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(name).toEqual([i18n.t('board.card.icon'), '🗑️']);

    await click(button);

    const open = panel() as HTMLElement;
    expect(open.getAttribute('role')).toBe('dialog');
    expect(open.getAttribute('aria-label')).toBe(i18n.t('board.card.icon'));
    expect(host.contains(open)).toBe(false);
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect(icons(open)).toEqual([...TASK_ICONS]);
    expect(recentRow(open)).toBeNull();
    // The current icon takes focus as it opens.
    expect(document.activeElement).toBe(iconButton(open, '🗑️'));
    expect(moreToggle(open)?.textContent).toBe(i18n.t('board.icons.more'));

    await click(moreToggle(open));

    expect(moreToggle(open)?.getAttribute('aria-expanded')).toBe('true');
    expect(moreToggle(open)?.textContent).toBe(i18n.t('board.icons.fewer'));
    const groups = [...open.querySelectorAll('.icon-more [role="group"]')];
    // Each group is named by its visible heading.
    expect(groups.map((group) => document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent)).toEqual(
      TASK_ICON_GROUPS.map((group) => i18n.t(`board.icons.groups.${group.key}`)),
    );
    expect(icons(open, '.icon-more')).toEqual(TASK_ICON_GROUPS.flatMap((group) => group.icons));

    await click(iconButton(open, '🧽'));

    expect((await store.tasks.list())[0]?.icon).toBe('🧽');
    // A pick closes it and puts focus back on the button, which shows the new icon.
    expect(panel()).toBeNull();
    expect(trigger(card)?.textContent).toBe('🧽');
    expect(document.activeElement).toBe(trigger(card));
  });

  it('closes on Esc, back on its button, without changing the icon', async () => {
    await addTask();
    const host = await render();
    await openCard(host, 'Bins');
    await click(trigger(host));

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger(host));
    expect((await store.tasks.list())[0]?.icon).toBe('🗑️');
  });

  it('opens with the groups showing when the icon is in one, so it is in view', async () => {
    await addTask({ icon: '🦷' });
    const host = await render();
    await openCard(host, 'Bins');
    await click(trigger(host));

    expect(moreToggle(panel() as HTMLElement)?.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toBe('🦷');
  });

  it('offers the icons last picked on this device first', async () => {
    await addTask();
    await addTask({ title: 'Cat food', icon: '🐕', position: 2000 });
    const host = await render();
    await openCard(host, 'Bins');
    const pickFromGroups = async (icon: string): Promise<void> => {
      await click(trigger(cardNamed(host, 'Bins')));
      await click(moreToggle(panel() as HTMLElement));
      await click(iconButton(panel() as HTMLElement, icon));
    };
    await pickFromGroups('🧽');
    await pickFromGroups('🐈');

    await openCard(host, 'Cat food');
    await click(trigger(cardNamed(host, 'Cat food')));
    const row = recentRow(panel() as HTMLElement);
    expect(row?.textContent?.startsWith(i18n.t('board.icons.recent'))).toBe(true);
    expect(icons(row as Element, '')).toEqual(['🐈', '🧽']);

    await click(iconButton(row as Element, '🧽'));
    expect((await store.tasks.list()).find((task) => task.title === 'Cat food')?.icon).toBe('🧽');
    expect(readDevicePreference('recentTaskIcons')).toEqual(['🧽', '🐈']);
  });

  it('lets a new task start on any icon in the composer, then goes back to the default', async () => {
    writeDevicePreference('recentTaskIcons', ['🐈']);
    const host = await render();
    const composer = host.querySelector('form.composer') as HTMLFormElement;
    const openMore = (): Promise<void> => click(composer.querySelector('button.composer-more-toggle'));
    await openMore();
    expect(trigger(composer)?.textContent).toBe(DEFAULT_TASK_ICON);

    await click(trigger(composer));

    // The same choices as a card's: recent picks, then the everyday icons, the default chosen.
    const open = panel() as HTMLElement;
    expect(icons(recentRow(open) as Element, '')).toEqual(['🐈']);
    expect(iconButton(open, DEFAULT_TASK_ICON)?.getAttribute('aria-pressed')).toBe('true');

    await click(moreToggle(open));
    await click(iconButton(open, '🧽'));

    expect(trigger(composer)?.textContent).toBe('🧽');
    // A pick never adds the task.
    expect(await store.tasks.list()).toEqual([]);

    await act(async () => {
      const input = composer.querySelector('input') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Scrub the sink');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(composer.querySelector('button[type="submit"]'));

    expect((await store.tasks.list()).map((task) => [task.title, task.icon])).toEqual([['Scrub the sink', '🧽']]);
    expect(readDevicePreference('recentTaskIcons')).toEqual(['🧽', '🐈']);

    // Ready for the next one: the panel closed and the default back.
    expect(trigger(composer)).toBeNull();
    await openMore();
    expect(trigger(composer)?.textContent).toBe(DEFAULT_TASK_ICON);
  });
});

describe('New column', () => {
  const box = (host: ParentNode): HTMLInputElement => host.querySelector('.column-new input') as HTMLInputElement;
  const alert = (host: ParentNode): Element | null => host.querySelector('.column-new [role="alert"]');

  async function addColumn(host: ParentNode, name: string): Promise<void> {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box(host), name);
      box(host).dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(host.querySelector('.column-new button[type="submit"]'));
  }

  it('adds the column at the end and empties the box', async () => {
    const host = await render();

    await addColumn(host, 'Garden');

    expect((await store.columns.list()).map((column) => column.name)).toEqual(['House', 'Garden']);
    expect(box(host).value).toBe('');
    expect(alert(host)).toBeNull();
  });

  it('keeps the name and says so, with no unhandled rejection, when the column cannot be added', async () => {
    vi.spyOn(store.columns, 'create').mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = await render();

    await addColumn(host, 'Garden');

    expect(box(host).value).toBe('Garden');
    expect(alert(host)?.textContent).toBe(i18n.t('board.newColumn.failed'));
    expect((await store.columns.list()).map((column) => column.name)).toEqual(['House']);

    // Trying again works and takes the message away.
    await click(host.querySelector('.column-new button[type="submit"]'));
    expect((await store.columns.list()).map((column) => column.name)).toEqual(['House', 'Garden']);
    expect(box(host).value).toBe('');
    expect(alert(host)).toBeNull();
  });

  it('does not put the name back over one typed while the failed add was on its way', async () => {
    let refuse: () => void = () => undefined;
    vi.spyOn(store.columns, 'create').mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          refuse = () => reject(new Error('offline'));
        }),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = await render();
    await addColumn(host, 'Garden');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box(host), 'Shed');
      box(host).dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => refuse());
    await flush();

    expect(box(host).value).toBe('Shed');
    expect(alert(host)?.textContent).toBe(i18n.t('board.newColumn.failed'));
  });
});
