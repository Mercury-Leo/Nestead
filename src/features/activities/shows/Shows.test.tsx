import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionContext } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import type { Member } from '../../../domain/types';
import { i18n, localeReady } from '../../../i18n';
import { Shows } from './Shows';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alex: Member = { id: 'm1', familyId: 'f-shows', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };
let store: DataStore;
let unmount: (() => void) | null = null;

async function addShows(count: number, status: (i: number) => 'to-watch' | 'dropped' = () => 'to-watch'): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await store.shows.create({
      imdbId: `tt${String(1000000 + i)}`,
      kind: i % 2 === 0 ? 'movie' : 'series',
      title: `Show ${String(i).padStart(3, '0')}`,
      fetchedAt: '2026-10-04T08:00:00.000Z',
      status: status(i),
    });
  }
}

/** Renders the page and waits for its first read. */
async function render(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <SessionContext.Provider value={{ store, me: alex, members: [alex], signOut: async () => {} }}>
        <Shows />
      </SessionContext.Provider>,
    ),
  );
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  for (let i = 0; i < 50 && host.querySelector('h1') === null; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return host;
}

const cards = (host: HTMLElement): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('main article, article')];
const button = (host: HTMLElement, text: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text));

beforeAll(async () => {
  await localeReady;
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
});

beforeEach(() => {
  localStorage.clear();
  store = createLocalStore('f-shows');
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('a long list of shows', () => {
  it('builds a page of 60, then the next with Show more, moving focus to the first new card', async () => {
    await addShows(130);
    const host = await render();
    expect(cards(host)).toHaveLength(60);
    expect(host.textContent).toContain(i18n.t('shows.showing', { shown: 60, total: 130 }));

    await act(async () => button(host, i18n.t('shows.showMore', { count: 60 }))?.click());
    expect(cards(host)).toHaveLength(120);
    expect(document.activeElement).toBe(cards(host)[60]?.querySelector('h3 a'));
    expect(host.textContent).toContain(i18n.t('shows.showing', { shown: 120, total: 130 }));

    await act(async () => button(host, i18n.t('shows.showMore', { count: 10 }))?.click());
    expect(cards(host)).toHaveLength(130);
    expect(button(host, i18n.t('shows.showMore', { count: 10 }).split(' ')[0] as string)).toBeUndefined();
    expect(host.textContent).toContain(i18n.t('shows.showing', { shown: 130, total: 130 }));
  });

  it('starts from the first page after a new filter', async () => {
    await addShows(130);
    const host = await render();
    await act(async () => button(host, i18n.t('shows.showMore', { count: 60 }))?.click());
    expect(cards(host)).toHaveLength(120);

    await act(async () => button(host, i18n.t('shows.statusCount.toWatch', { count: 130 }))?.click());
    expect(cards(host)).toHaveLength(60);

    // Back to the list that had two pages: it starts from one again.
    await act(async () => button(host, i18n.t('shows.all', { count: 130 }))?.click());
    expect(cards(host)).toHaveLength(60);
  });

  it('shows a short list whole, with no count and no Show more', async () => {
    await addShows(40);
    const host = await render();
    expect(cards(host)).toHaveLength(40);
    expect(host.textContent).not.toContain(i18n.t('shows.showing', { shown: 40, total: 40 }));
    expect(button(host, i18n.t('shows.showMore', { count: 1 }).split(' ')[0] as string)).toBeUndefined();
  });
});

describe('dropped shows', () => {
  it('stay out of All and its count, and wait under Dropped', async () => {
    // Every third show dropped: 4 of 10.
    await addShows(10, (i) => (i % 3 === 0 ? 'dropped' : 'to-watch'));
    const host = await render();
    expect(cards(host)).toHaveLength(6);
    expect(button(host, i18n.t('shows.all', { count: 6 }))).toBeDefined();
    const dropped = button(host, i18n.t('shows.statusCount.dropped', { count: 4 }));
    expect(dropped).toBeDefined();

    await act(async () => dropped?.click());
    expect(cards(host)).toHaveLength(4);
    expect(cards(host).every((card) => card.textContent?.includes(i18n.t('shows.status.dropped')))).toBe(true);
  });

  it('offer Restore instead of Drop it, which puts them back on the list', async () => {
    await addShows(3, (i) => (i === 0 ? 'dropped' : 'to-watch'));
    const host = await render();
    await act(async () => button(host, i18n.t('shows.statusCount.dropped', { count: 1 }))?.click());
    const card = cards(host)[0] as HTMLElement;
    await act(async () => card.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click());
    expect(button(card, i18n.t('shows.card.drop'))).toBeUndefined();
    await act(async () => button(card, i18n.t('shows.card.restore'))?.click());
    for (let i = 0; i < 20 && cards(host).length === 1; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    // It left the Dropped filter; All has all three again.
    expect(cards(host)).toHaveLength(0);
    expect(button(host, i18n.t('shows.all', { count: 3 }))).toBeDefined();
  });

  it('leave All when someone drops one, from its details', async () => {
    await addShows(3);
    const host = await render();
    const first = cards(host)[0] as HTMLElement;
    await act(async () => first.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click());
    await act(async () => button(first, i18n.t('shows.card.drop'))?.click());
    for (let i = 0; i < 20 && cards(host).length === 3; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    expect(cards(host)).toHaveLength(2);
    expect(button(host, i18n.t('shows.statusCount.dropped', { count: 1 }))).toBeDefined();
  });
});
