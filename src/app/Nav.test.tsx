import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SessionContext } from '../auth/session';
import type { Session } from '../auth/session';
import { ThemeProvider } from '../components/theme/theme';
import { createLocalStore } from '../data/local/localStore';
import type { Member } from '../domain/types';
import { KitchenProvider } from '../features/larder/KitchenContext';
import { LocaleProvider, i18n } from '../i18n';
import { Sidebar } from './Nav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
});

describe('the sidebar', () => {
  it("lists every section, and the current section's pages", async () => {
    const host = await render(<Sidebar />, '/pantry');
    for (const key of ['nav.board', 'nav.lists', 'nav.larder', 'nav.library', 'nav.search', 'nav.pantry', 'nav.diet', 'nav.family'] as const) {
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
