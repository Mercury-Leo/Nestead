import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../../auth/session';
import { createLocalStore, readPreference } from '../../../data/local/localStore';
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
/** A button by the start of its text, or by its whole name when it shows only an icon. */
const button = (host: HTMLElement, text: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text) || (b.textContent === '' && b.getAttribute('aria-label') === text));
const titles = (host: HTMLElement): string[] => cards(host).map((card) => card.querySelector('h3 a')?.firstChild?.textContent ?? '');
const sheet = (): HTMLDialogElement | null => document.querySelector('dialog[open]');
const chip = (root: ParentNode, text: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent === text);

/** Types into the page's search field, or into `field` (the add sheet's, which comes after it in the page). */
async function type(host: HTMLElement, text: string, field = host.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement): Promise<void> {
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
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
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

  it('names a picked tag as the family spells it, when the shows left spell it another way', async () => {
    // One tag in two spellings. The family spells it as its first show does ("Bad movie", added first); the show that comes first in the list spells it "bad movie".
    const base = { kind: 'movie', fetchedAt: '2026-10-04T08:00:00.000Z', status: 'to-watch' } as const;
    await store.shows.create({ ...base, imdbId: 'tt4100000', title: 'Sharknado', tags: ['Bad movie'] });
    await store.shows.create({ ...base, imdbId: 'tt4100001', title: 'Santa Claus Conquers the Martians', tags: ['bad movie'] });
    const host = await render();
    await act(async () => button(host, i18n.t('shows.tags.label'))?.click());
    const picker = sheet() as HTMLDialogElement;
    expect(chip(picker, 'Bad movie 2')).toBeDefined();
    await act(async () => chip(picker, 'Bad movie 2')?.click());
    await act(async () => button(picker, i18n.t('shows.filter.done', { count: 2 }))?.click());

    // Only the show that spells it "bad movie" is left; the tag is still "Bad movie", picked.
    await type(host, 'santa');
    expect(titles(host)).toEqual(['Santa Claus Conquers the Martians']);
    await act(async () => button(host, 'Bad movie')?.click());
    const chips = [...(sheet() as HTMLDialogElement).querySelectorAll<HTMLButtonElement>('[role="group"] button')];
    expect(chips.map((b) => b.textContent)).toEqual(['Bad movie 1']);
    expect(chips[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('filters by a tag pressed on a card, and goes back up to the filters', async () => {
    await addShelf();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const host = await render();
    const elf = cards(host).find((card) => card.textContent?.includes('Elf'));
    const label = i18n.t('shows.tags.filterBy', { tag: 'Christmas' });
    await act(async () => elf?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click());
    expect(titles(host)).toEqual(['Elf', 'Santa Claus Conquers the Martians']);
    // The Tags control names it (its screen-reader label; the cards' chips say only "Christmas").
    expect(host.textContent).toContain(i18n.t('shows.tags.picked', { tags: 'Christmas' }));
    expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    // A tag already picked changes nothing.
    await act(async () => elf?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click());
    expect(titles(host)).toEqual(['Elf', 'Santa Claus Conquers the Martians']);
  });

  it('treats a card spelling a picked tag another way as already picked', async () => {
    const base = { kind: 'movie', fetchedAt: '2026-10-04T08:00:00.000Z', status: 'to-watch' } as const;
    await store.shows.create({ ...base, imdbId: 'tt4200000', title: 'Sharknado', tags: ['Bad movie'] });
    await store.shows.create({ ...base, imdbId: 'tt4200001', title: 'Santa Claus Conquers the Martians', tags: ['bad movie'] });
    const host = await render();
    const press = async (title: string, tag: string): Promise<void> => {
      const card = cards(host).find((c) => c.textContent?.includes(title));
      await act(async () => card?.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('shows.tags.filterBy', { tag })}"]`)?.click());
    };
    await press('Sharknado', 'Bad movie');
    await press('Santa Claus', 'bad movie');
    // One tag, not two: the control names it once, as the family spells it, and the saved view holds just the first.
    expect(host.textContent).toContain(i18n.t('shows.tags.picked', { tags: 'Bad movie' }));
    expect((readPreference('f-shows', 'showsView') as { tags: string[] }).tags).toEqual(['Bad movie']);
  });

  it("adds a tag from a card's details, and the card shows it", async () => {
    await addShelf();
    const host = await render();
    const inception = (): HTMLElement => cards(host).find((card) => card.textContent?.includes('Inception')) as HTMLElement;
    await act(async () => inception().querySelector<HTMLButtonElement>('button[aria-expanded]')?.click());
    await act(async () => button(inception(), i18n.t('shows.tags.edit'))?.click());
    const editor = sheet() as HTMLDialogElement;
    expect(editor.querySelector('h2')?.textContent).toBe('Tags for Inception');
    await act(async () => chip(editor, 'Bad movie')?.click());
    expect(inception().querySelector(`button[aria-label="${i18n.t('shows.tags.filterBy', { tag: 'Bad movie' })}"]`)).not.toBeNull();
    await act(async () => button(editor, i18n.t('shows.tags.done'))?.click());
    expect(sheet()).toBeNull();
  });

  /** Opens a card's details and its Tags sheet from the Tags button, focused as a press would have left it. */
  async function openTags(host: HTMLElement, title: string): Promise<{ tagsButton: HTMLButtonElement; editor: HTMLDialogElement }> {
    const card = (): HTMLElement => cards(host).find((c) => c.textContent?.includes(title)) as HTMLElement;
    await act(async () => card().querySelector<HTMLButtonElement>('button[aria-expanded]')?.click());
    const tagsButton = button(card(), i18n.t('shows.tags.edit')) as HTMLButtonElement;
    // jsdom's click() does not move focus.
    tagsButton.focus();
    await act(async () => tagsButton.click());
    return { tagsButton, editor: sheet() as HTMLDialogElement };
  }

  it("returns focus to the Tags button when the sheet closes, however it closes", async () => {
    await addShelf();
    const host = await render();
    const { tagsButton, editor } = await openTags(host, 'Elf');
    expect(editor).not.toBeNull();

    // A browser focuses the sheet's first control as it opens, and removing the open dialog drops focus to the page.
    const focusIn = (dialog: HTMLElement, label: string): HTMLButtonElement => {
      const target = button(dialog, label) ?? (dialog.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement);
      target.focus();
      return target;
    };
    await act(async () => focusIn(editor, i18n.t('shows.tags.done')).click());
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(tagsButton);

    // The Close button and a click on the backdrop close it the same way.
    await act(async () => tagsButton.click());
    await act(async () => focusIn(sheet() as HTMLDialogElement, i18n.t('common.close')).click());
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(tagsButton);

    await act(async () => tagsButton.click());
    (sheet()?.querySelector('input') as HTMLInputElement).focus();
    await act(async () => (sheet() as HTMLDialogElement).click());
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(tagsButton);
  });

  it('puts focus in the search field when the Tags button is gone, as the card no longer matches the filter', async () => {
    await addShelf();
    const host = await render();
    await act(async () => button(host, i18n.t('shows.tags.label'))?.click());
    await act(async () => chip(sheet() as HTMLDialogElement, 'Christmas 2')?.click());
    await act(async () => button(sheet() as HTMLDialogElement, i18n.t('shows.filter.done', { count: 2 }))?.click());
    expect(titles(host)).toEqual(['Elf', 'Santa Claus Conquers the Martians']);

    const { tagsButton, editor } = await openTags(host, 'Elf');
    // Taking Christmas off Elf, its only tag, drops it from the filtered list, and its Tags button with it.
    await act(async () => chip(editor, 'Christmas')?.click());
    expect(tagsButton.isConnected).toBe(false);
    const done = button(editor, i18n.t('shows.tags.done')) as HTMLButtonElement;
    done.focus();
    await act(async () => done.click());
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('input[type="search"]'));
  });

  it('clears the tag filter and shows the card when Add show opens a show the filter hides', async () => {
    await addShelf();
    // The add sheet searches /api/shows; its one result is a show already on the list.
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        return new Response(JSON.stringify({ results: [{ imdbId: 'tt4000000', kind: 'movie', title: 'Sharknado', year: '2013' }] }));
      }),
    );
    const host = await render();
    await act(async () => button(host, i18n.t('shows.tags.label'))?.click());
    await act(async () => chip(sheet() as HTMLDialogElement, 'Christmas 2')?.click());
    await act(async () => button(sheet() as HTMLDialogElement, i18n.t('shows.filter.done', { count: 2 }))?.click());
    expect(titles(host)).toEqual(['Elf', 'Santa Claus Conquers the Martians']);
    expect(host.textContent).toContain(i18n.t('shows.tags.picked', { tags: 'Christmas' }));

    // On a phone the page's Add show is an icon button, labelled; on desktop it has text.
    const addShow = host.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('shows.add')}"]`) ?? button(host, i18n.t('shows.add'));
    await act(async () => addShow?.click());
    const adder = sheet() as HTMLDialogElement;
    await type(host, 'sharknado', adder.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement);
    await act(async () => button(adder, i18n.t('shows.addSheet.search'))?.click());
    for (let i = 0; i < 50 && adder.querySelector('ul[aria-label] button') === null; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    // Already on the list, so it says so, and choosing it asks nothing more of the service.
    expect(adder.querySelector('ul[aria-label]')?.textContent).toContain(i18n.t('shows.addSheet.inList'));
    await act(async () => adder.querySelector<HTMLButtonElement>('ul[aria-label] button')?.click());

    expect(asked).toHaveLength(1);
    expect(sheet()).toBeNull();
    expect(host.textContent).not.toContain(i18n.t('shows.tags.picked', { tags: 'Christmas' }));
    expect((readPreference('f-shows', 'showsView') as { tags: string[] }).tags).toEqual([]);
    expect(titles(host)).toEqual(['Elf', 'Inception', 'Santa Claus Conquers the Martians', 'Sharknado']);
  });
});

describe('the add sheet', () => {
  it('gives focus back to Add show when it closes', async () => {
    await addShows(2);
    const host = await render();
    const addShow = host.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('shows.add')}"]`) as HTMLButtonElement;
    // jsdom's click() does not move focus; a keyboard press leaves it on the button.
    addShow.focus();
    await act(async () => addShow.click());
    const close = sheet()?.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('common.close')}"]`) as HTMLButtonElement;
    // A browser puts focus in the open sheet; the page then stops rendering it.
    close.focus();
    await act(async () => close.click());
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(addShow);
  });
});
