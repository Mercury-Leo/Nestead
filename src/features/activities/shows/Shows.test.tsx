import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import type { Member } from '../../../domain/types';
import { i18n, loadLocale, localeReady } from '../../../i18n';
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
const titles = (host: HTMLElement): string[] => cards(host).map((card) => card.querySelector('h3 a')?.firstChild?.textContent ?? '');
const sheet = (): HTMLDialogElement | null => document.querySelector('dialog[open]');
const chip = (root: ParentNode, text: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent === text);

async function type(host: HTMLElement, text: string): Promise<void> {
  const field = host.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeAll(async () => {
  await localeReady;
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

beforeEach(() => {
  localStorage.clear();
  store = createLocalStore('f-shows');
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
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

describe('genres', () => {
  const SHELF: [string, string[] | undefined][] = [
    ['Rush Hour', ['Action', 'Comedy', 'Crime']],
    ['Heat', ['Action', 'Crime', 'Drama']],
    ['Airplane!', ['Comedy']],
    ['Dune', ['Action', 'Adventure', 'Sci-Fi']],
    ['Older Entry', undefined],
  ];

  async function addShelf(): Promise<void> {
    for (const [i, [title, genres]] of SHELF.entries()) {
      await store.shows.create({
        imdbId: `tt${String(3000000 + i)}`,
        kind: 'movie',
        title,
        fetchedAt: '2026-10-04T08:00:00.000Z',
        status: 'to-watch',
        ...(genres === undefined ? {} : { genres }),
      });
    }
  }

  it('shows each card its genres, in the screen language', async () => {
    await addShelf();
    const host = await render();
    const rushHour = cards(host).find((card) => card.textContent?.includes('Rush Hour'));
    expect(rushHour?.textContent).toContain('Action, Comedy, Crime');
    try {
      await loadLocale('he');
      await act(async () => {
        await i18n.changeLanguage('he');
      });
      expect(rushHour?.textContent).toContain(`${i18n.t('shows.genre.action')}, ${i18n.t('shows.genre.comedy')}`);
      // The search finds a genre by its Hebrew name as well as its English one.
      await type(host, i18n.t('shows.genre.sciFi'));
      expect(titles(host)).toEqual(['Dune']);
      await type(host, 'sci-fi');
      expect(titles(host)).toEqual(['Dune']);
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('keeps only shows with every genre picked, and offers only genres that leave some', async () => {
    await addShelf();
    const host = await render();
    await act(async () => button(host, i18n.t('shows.genres.label'))?.click());
    const picker = sheet() as HTMLDialogElement;
    expect(picker).not.toBeNull();
    // Every genre on the list, A to Z, with how many shows have it.
    expect([...picker.querySelectorAll('[role="group"] button')].map((b) => b.textContent)).toEqual([
      'Action 3', 'Adventure 1', 'Comedy 2', 'Crime 2', 'Drama 1', 'Sci-fi 1',
    ]);

    await act(async () => chip(picker, 'Action 3')?.click());
    expect(titles(host)).toEqual(['Dune', 'Heat', 'Rush Hour']);
    // Picked stays offered; Action leaves no show for nothing but Comedy alone, so counts follow.
    expect([...picker.querySelectorAll('[role="group"] button')].map((b) => b.textContent)).toEqual([
      'Action 3', 'Adventure 1', 'Comedy 1', 'Crime 2', 'Drama 1', 'Sci-fi 1',
    ]);

    await act(async () => chip(picker, 'Comedy 1')?.click());
    expect(titles(host)).toEqual(['Rush Hour']);
    // Genres no action comedy has would list nothing, so they are no longer offered.
    expect([...picker.querySelectorAll('[role="group"] button')].map((b) => b.textContent)).toEqual(['Action 1', 'Comedy 1', 'Crime 1']);
    expect(button(picker, i18n.t('shows.filter.done', { count: 1 }))).toBeDefined();
    await act(async () => button(picker, i18n.t('shows.filter.done', { count: 1 }))?.click());
    expect(sheet()).toBeNull();
    // The chip names what is picked, and the status counts follow the genres.
    expect(host.textContent).toContain('Action and Comedy');
    expect(button(host, i18n.t('shows.all', { count: 1 }))).toBeDefined();

    // Clear, in the sheet the chip opens again, takes every genre off.
    await act(async () => button(host, 'Action and Comedy')?.click());
    await act(async () => button(sheet() as HTMLDialogElement, i18n.t('shows.filter.clear'))?.click());
    expect(cards(host)).toHaveLength(5);
    expect(button(host, i18n.t('shows.genres.label'))).toBeDefined();
  });

  it('finds "action comedy" typed in the search, and mixes title words in', async () => {
    await addShelf();
    const host = await render();
    await type(host, 'action comedy');
    expect(titles(host)).toEqual(['Rush Hour']);
    await type(host, 'crime');
    expect(titles(host)).toEqual(['Heat', 'Rush Hour']);
    await type(host, 'heat action');
    expect(titles(host)).toEqual(['Heat']);
    await type(host, 'older');
    expect(titles(host)).toEqual(['Older Entry']);
  });

  it('offers to read genres for shows added before them, once each, then goes away', async () => {
    await addShelf();
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const id = new URL(url, 'http://localhost').searchParams.get('id') ?? '';
        asked.push(id);
        return new Response(JSON.stringify({ show: { imdbId: id, kind: 'movie', title: 'Older Entry', genres: ['Mystery'] } }));
      }),
    );
    const host = await render();
    expect(host.textContent).toContain(i18n.t('shows.genres.missing', { count: 1 }));

    await act(async () => button(host, i18n.t('shows.genres.fetch'))?.click());
    for (let i = 0; i < 20 && host.textContent?.includes(i18n.t('shows.genres.fetch')); i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    expect(asked).toEqual(['tt3000004']);
    expect(button(host, i18n.t('shows.genres.fetch'))).toBeUndefined();
    expect(cards(host).find((card) => card.textContent?.includes('Older Entry'))?.textContent).toContain('Mystery');
  });

  it('says why when the lookups stop, and keeps offering the rest', async () => {
    await addShelf();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'limit' }), { status: 429 })));
    const host = await render();
    await act(async () => button(host, i18n.t('shows.genres.fetch'))?.click());
    for (let i = 0; i < 20 && !host.textContent?.includes(i18n.t('shows.failure.limit')); i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    expect(host.textContent).toContain(i18n.t('shows.failure.limit'));
    expect(host.textContent).toContain(i18n.t('shows.genres.missing', { count: 1 }));
    expect(button(host, i18n.t('shows.genres.fetch'))?.disabled).toBe(false);
  });
});

describe('tags', () => {
  // Added in reverse A to Z, so newest first and A to Z (the tie-break when two share a millisecond) agree.
  const SHELF: [string, string[]][] = [
    ['Sharknado', ['Bad movie', 'Movie night']],
    ['Santa Claus Conquers the Martians', ['Bad movie', 'Christmas']],
    ['Inception', []],
    ['Elf', ['Christmas']],
  ];

  async function addShelf(): Promise<void> {
    for (const [i, [title, tags]] of SHELF.entries()) {
      await store.shows.create({ imdbId: `tt${String(4000000 + i)}`, kind: 'movie', title, fetchedAt: '2026-10-04T08:00:00.000Z', status: 'to-watch', tags });
    }
  }

  it('has no Tags control until a show has a tag', async () => {
    await addShows(3);
    const host = await render();
    expect(button(host, i18n.t('shows.tags.label'))).toBeUndefined();
  });

  it('keeps only shows with every tag picked, and the status counts follow', async () => {
    await addShelf();
    const host = await render();
    await act(async () => button(host, i18n.t('shows.tags.label'))?.click());
    const picker = sheet() as HTMLDialogElement;
    expect([...picker.querySelectorAll('[role="group"] button')].map((b) => b.textContent)).toEqual(['Bad movie 2', 'Christmas 2', 'Movie night 1']);

    await act(async () => chip(picker, 'Bad movie 2')?.click());
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians', 'Sharknado']);
    await act(async () => chip(picker, 'Christmas 1')?.click());
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians']);
    await act(async () => button(picker, i18n.t('shows.filter.done', { count: 1 }))?.click());
    expect(sheet()).toBeNull();
    expect(host.textContent).toContain('Bad movie and Christmas');
    expect(button(host, i18n.t('shows.all', { count: 1 }))).toBeDefined();

    await act(async () => button(host, 'Bad movie and Christmas')?.click());
    await act(async () => button(sheet() as HTMLDialogElement, i18n.t('shows.filter.clear'))?.click());
    expect(cards(host)).toHaveLength(4);
  });

  it('are cleared by Show all', async () => {
    await addShelf();
    const host = await render();
    await act(async () => button(host, i18n.t('shows.tags.label'))?.click());
    await act(async () => chip(sheet() as HTMLDialogElement, 'Christmas 2')?.click());
    await act(async () => button(sheet() as HTMLDialogElement, i18n.t('shows.filter.done', { count: 2 }))?.click());
    await type(host, 'sharknado');
    expect(cards(host)).toHaveLength(0);
    await act(async () => button(host, i18n.t('shows.showAll'))?.click());
    expect(cards(host)).toHaveLength(4);
    expect(button(host, i18n.t('shows.tags.label'))).toBeDefined();
  });

  it('finds a tag typed in the search, by the start of its words', async () => {
    await addShelf();
    const host = await render();
    await type(host, 'bad');
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians', 'Sharknado']);
    await type(host, 'christmas bad');
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians']);
    await type(host, 'ovie');
    expect(cards(host)).toHaveLength(0);
  });
});
