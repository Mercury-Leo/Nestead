import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../auth/session';
import type { Session } from '../auth/session';
import { ThemeProvider } from '../components/theme/theme';
import { createLocalStore } from '../data/local/localStore';
import type { Member } from '../domain/types';
import { KitchenProvider } from '../features/larder/KitchenContext';
import { LocaleProvider, i18n } from '../i18n';
import { PagePills, Sidebar, TabBar } from './Nav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The pages warmed, in order: what warm.ts would have started loading. */
const warmed = vi.hoisted((): string[] => []);
vi.mock('./warm', () => ({ warmPage: (path: string) => warmed.push(path) }));

const alex: Member = { id: 'm-alex', familyId: 'f-test', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };

function session(): Session {
  return { store: createLocalStore('f-test'), me: alex, members: [alex], signOut: async () => {} };
}

/** Shows the router's path, so a test can see where a click went. */
function Where(): JSX.Element {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

let unmount: (() => void) | null = null;

async function render(node: ReactNode, path: string): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <ThemeProvider>
          <SessionContext.Provider value={session()}>
            <KitchenProvider>
              <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                {node}
                <Where />
              </MemoryRouter>
            </KitchenProvider>
          </SessionContext.Provider>
        </ThemeProvider>
      </LocaleProvider>,
    );
  });
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

/** The link whose visible text is `label`. */
function link(host: HTMLElement, label: string): HTMLAnchorElement | undefined {
  return [...host.querySelectorAll('a')].find((a) => a.textContent?.trim().startsWith(label));
}

async function click(element: Element | null | undefined): Promise<void> {
  if (element === null || element === undefined) throw new Error('nothing to click');
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function bar(host: HTMLElement): HTMLElement {
  return host.querySelector(`nav[aria-label="${i18n.t('nav.main')}"]`) as HTMLElement;
}

function moreButton(host: HTMLElement): HTMLButtonElement {
  return [...bar(host).querySelectorAll('button')].find((b) => b.textContent === i18n.t('nav.more')) as HTMLButtonElement;
}

/** The sheet's button whose text or label starts with `label`. */
function sheetButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('dialog button')].find((b) =>
    (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().startsWith(label),
  ) as HTMLButtonElement | undefined;
}

beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
  // jsdom has no modal dialogs; the Sheet opens and closes its <dialog> with these.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  unmount?.();
  unmount = null;
  localStorage.clear();
  warmed.length = 0;
});

describe('the sidebar', () => {
  it("lists every section, and the current section's pages", async () => {
    const host = await render(<Sidebar />, '/pantry');
    for (const key of ['nav.board', 'nav.lists', 'nav.larder', 'nav.library', 'nav.search', 'nav.pantry', 'nav.diet', 'nav.activities', 'nav.family'] as const) {
      expect(link(host, i18n.t(key)), key).toBeDefined();
    }
    expect(link(host, i18n.t('nav.pantry'))?.getAttribute('aria-current')).toBe('page');
    // The section header is not the page.
    expect(link(host, i18n.t('nav.larder'))?.getAttribute('aria-current')).toBeNull();
  });

  it("folds sections you're not in", async () => {
    const host = await render(<Sidebar />, '/');
    expect(link(host, i18n.t('nav.board'))?.getAttribute('aria-current')).toBe('page');
    expect(link(host, i18n.t('nav.larder'))?.getAttribute('href')).toBe('/library');
    expect(link(host, i18n.t('nav.pantry'))).toBeUndefined();
  });

  it('counts recipe pages as Library', async () => {
    const host = await render(<Sidebar />, '/recipe/abc');
    expect(link(host, i18n.t('nav.library'))?.getAttribute('aria-current')).toBe('page');
  });

  it('shows the diet rules only in the Larder', async () => {
    const inLarder = await render(<Sidebar />, '/library');
    expect(inLarder.textContent).toContain(i18n.t('nav.editDiet'));
    unmount?.();
    const onBoard = await render(<Sidebar />, '/');
    expect(onBoard.textContent).not.toContain(i18n.t('nav.editDiet'));
  });
});

describe('the tab bar', () => {
  it('shows the pinned sections and More, and lights the current section', async () => {
    const host = await render(<TabBar />, '/recipe/abc');
    const labels = [...bar(host).querySelectorAll('a')].map((a) => a.textContent);
    expect(labels).toEqual([i18n.t('nav.board'), i18n.t('nav.lists'), i18n.t('nav.larder'), i18n.t('nav.activities')]);
    expect(link(bar(host), i18n.t('nav.larder'))?.getAttribute('aria-current')).toBe('true');
    expect(moreButton(host).getAttribute('aria-haspopup')).toBe('dialog');
    expect(moreButton(host).getAttribute('aria-current')).toBeNull();
  });

  it("lights More in a section that isn't pinned", async () => {
    const host = await render(<TabBar />, '/family');
    expect(moreButton(host).getAttribute('aria-current')).toBe('true');
  });

  it('opens More, and a tile goes to its section and closes the sheet', async () => {
    const host = await render(<TabBar />, '/');
    await click(moreButton(host));
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    await click(link(dialog as HTMLElement, i18n.t('nav.family')));
    expect(host.querySelector('[data-testid="where"]')?.textContent).toBe('/family');
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });

  it('unpins from Edit bar, and keeps the choice', async () => {
    let host = await render(<TabBar />, '/');
    await click(moreButton(host));
    await click(sheetButton(i18n.t('nav.editBar')));
    const lists = sheetButton(i18n.t('nav.lists'));
    expect(lists?.getAttribute('aria-pressed')).toBe('true');
    await click(lists);
    expect(link(bar(host), i18n.t('nav.lists'))).toBeUndefined();
    expect(document.querySelector('dialog')?.textContent).toContain(i18n.t('nav.pinnedCount', { pinned: 3, max: 4 }));

    unmount?.();
    host = await render(<TabBar />, '/');
    expect(link(bar(host), i18n.t('nav.lists'))).toBeUndefined();
    expect(link(bar(host), i18n.t('nav.board'))).toBeDefined();
  });

  it('pins a section back from Edit bar', async () => {
    const host = await render(<TabBar />, '/');
    await click(moreButton(host));
    await click(sheetButton(i18n.t('nav.editBar')));
    await click(sheetButton(i18n.t('nav.lists')));
    expect(link(bar(host), i18n.t('nav.lists'))).toBeUndefined();
    await click(sheetButton(i18n.t('nav.lists')));
    expect(link(bar(host), i18n.t('nav.lists'))).toBeDefined();
    expect(sheetButton(i18n.t('nav.lists'))?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('dialog')?.textContent).toContain(i18n.t('nav.pinnedCount', { pinned: 4, max: 4 }));
  });

  it('refuses to unpin the last section, and says so', async () => {
    const host = await render(<TabBar />, '/');
    await click(moreButton(host));
    await click(sheetButton(i18n.t('nav.editBar')));
    await click(sheetButton(i18n.t('nav.lists')));
    await click(sheetButton(i18n.t('nav.larder')));
    await click(sheetButton(i18n.t('nav.activities')));
    await click(sheetButton(i18n.t('nav.board')));
    expect(link(bar(host), i18n.t('nav.board'))).toBeDefined();
    expect(document.querySelector('dialog')?.textContent).toContain(i18n.t('nav.keepOne'));
  });

  it("doesn't let Family be pinned", async () => {
    const host = await render(<TabBar />, '/');
    await click(moreButton(host));
    await click(sheetButton(i18n.t('nav.editBar')));
    const family = sheetButton(i18n.t('nav.family'));
    expect(family?.disabled).toBe(true);
    expect(family?.getAttribute('aria-label')).toBe(i18n.t('nav.notPinnable', { section: i18n.t('nav.family') }));
  });
});

describe('the page pills', () => {
  it("show a section's pages, with the current one marked", async () => {
    const host = await render(<PagePills />, '/pantry');
    const pills = host.querySelector(`nav[aria-label="${i18n.t('nav.sectionPages', { section: i18n.t('nav.larder') })}"]`);
    expect([...(pills?.querySelectorAll('a') ?? [])].map((a) => a.textContent)).toEqual([
      i18n.t('nav.library'),
      i18n.t('nav.search'),
      i18n.t('nav.pantry'),
      i18n.t('nav.diet'),
    ]);
    expect(link(pills as HTMLElement, i18n.t('nav.pantry'))?.getAttribute('aria-current')).toBe('page');
  });

  it('stay away from sections with one page', async () => {
    for (const path of ['/', '/lists', '/family']) {
      const host = await render(<PagePills />, path);
      expect(host.querySelector('nav'), path).toBeNull();
      unmount?.();
      unmount = null;
    }
  });
});

describe('warming a page', () => {
  /** Dispatches a DOM event on `element` inside act(), as the browser would. */
  async function fire(element: Element | undefined, event: Event): Promise<void> {
    if (element === undefined) throw new Error('no element');
    await act(async () => {
      element.dispatchEvent(event);
    });
  }

  it('starts on a pointer over a sidebar link, a press on it, or focus', async () => {
    const host = await render(<Sidebar />, '/');
    const activities = link(host, i18n.t('nav.activities'));
    await fire(activities, new PointerEvent('pointerover', { bubbles: true }));
    expect(warmed).toEqual(['/shows']);
    await fire(activities, new PointerEvent('pointerdown', { bubbles: true }));
    await act(async () => activities?.focus());
    expect(warmed).toEqual(['/shows', '/shows', '/shows']);
    // A section's own pages warm too, by their own path.
    await fire(link(host, i18n.t('nav.larder')), new PointerEvent('pointerover', { bubbles: true }));
    expect(warmed.at(-1)).toBe('/library');
  });

  it('starts on a press in the tab bar, and on a tile under More', async () => {
    const host = await render(<TabBar />, '/');
    await fire(link(bar(host), i18n.t('nav.activities')), new PointerEvent('pointerdown', { bubbles: true }));
    expect(warmed).toEqual(['/shows']);
    await click(moreButton(host));
    await fire(link(document.querySelector('dialog') as HTMLElement, i18n.t('nav.family')), new PointerEvent('pointerover', { bubbles: true }));
    expect(warmed).toEqual(['/shows', '/family']);
  });

  it('does not start on its own', async () => {
    await render(<Sidebar />, '/');
    await render(<TabBar />, '/shows');
    expect(warmed).toEqual([]);
  });
});
