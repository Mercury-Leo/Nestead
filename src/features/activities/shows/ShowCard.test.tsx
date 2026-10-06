import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SessionContext } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { FetchedDetails } from '../../../domain/shows';
import type { Member, Show } from '../../../domain/types';
import { i18n, loadLocale, localeReady } from '../../../i18n';
import { Facts, Genres, ShowCard, Tags, sameShow } from './ShowCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = (): void => undefined;

let unmount: (() => void) | null = null;

/** The facts line's items, as the reader scans them. */
function facts(show: FetchedDetails): string[] {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Facts show={show} />));
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return [...(host.querySelector('p')?.children ?? [])].map((item) => (item.textContent ?? '').trim());
}

beforeAll(async () => {
  await localeReady;
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('Facts', () => {
  it("gives a series its seasons and an episode's length", () => {
    const items = facts({ imdbId: 'tt0386676', kind: 'series', title: 'The Office', year: 2005, totalSeasons: 9, runtimeMin: 22, imdbRating: 9 });
    expect(items.slice(0, 4)).toEqual(['2005', 'Series', '9 seasons', '22 min']);
  });

  it("gives a movie its length and no seasons", () => {
    const items = facts({ imdbId: 'tt1375666', kind: 'movie', title: 'Inception', year: 2010, runtimeMin: 148, totalSeasons: 3 });
    expect(items).toEqual(['2010', 'Movie', '148 min']);
  });

  it('leaves out what the service did not give', () => {
    expect(facts({ imdbId: 'tt0903747', kind: 'series', title: 'Breaking Bad' })).toEqual(['Series']);
  });
});

describe('sameShow', () => {
  const show: Show = {
    id: 's1', familyId: 'f', createdAt: '2026-10-04T08:00:00.000Z', updatedAt: '2026-10-04T08:00:00.000Z',
    imdbId: 'tt1375666', kind: 'movie', title: 'Inception', fetchedAt: '2026-10-04T08:00:00.000Z', status: 'to-watch',
  };

  it('treats a re-read copy with the same fields as the same show', () => {
    expect(sameShow(show, { ...show })).toBe(true);
    expect(sameShow(show, JSON.parse(JSON.stringify(show)) as Show)).toBe(true);
  });

  it('sees a changed, added or cleared field', () => {
    expect(sameShow(show, { ...show, status: 'watching' })).toBe(false);
    expect(sameShow(show, { ...show, watchedAt: '2026-10-04T21:00:00.000Z' })).toBe(false);
    const { fetchedAt: _fetchedAt, ...without } = show;
    expect(sameShow(show, { ...without, plot: 'x' } as Show)).toBe(false);
    expect(sameShow({ ...show, plot: 'x' }, show)).toBe(false);
  });

  it('compares genres item by item, so a re-read list is the same', () => {
    const withGenres = { ...show, genres: ['Action', 'Sci-Fi'] };
    expect(sameShow(withGenres, { ...withGenres, genres: ['Action', 'Sci-Fi'] })).toBe(true);
    expect(sameShow(withGenres, { ...withGenres, genres: ['Action'] })).toBe(false);
    expect(sameShow(withGenres, { ...withGenres, genres: ['Sci-Fi', 'Action'] })).toBe(false);
    expect(sameShow(withGenres, { ...withGenres, genres: [] })).toBe(false);
    expect(sameShow({ ...show, genres: [] }, show)).toBe(false);
  });

  it('compares tags item by item too', () => {
    const tagged = { ...show, tags: ['Bad movie'] };
    expect(sameShow(tagged, { ...tagged, tags: ['Bad movie'] })).toBe(true);
    expect(sameShow(tagged, { ...tagged, tags: ['Bad movie', 'Christmas'] })).toBe(false);
    expect(sameShow(tagged, { ...tagged, tags: [] })).toBe(false);
    expect(sameShow({ ...show, tags: [] }, show)).toBe(false);
  });
});

describe('Genres', () => {
  function genres(list: string[] | undefined): HTMLElement {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<Genres genres={list} />));
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    return host;
  }

  it('lists the genres, and translates the ones it knows', async () => {
    expect(genres(['Action', 'Sci-Fi', 'Film-Noir']).textContent).toBe('Action, Sci-fi, Film noir');
    unmount?.();
    try {
      await loadLocale('he');
      await act(async () => {
        await i18n.changeLanguage('he');
      });
      // A genre the app has no name for shows as the service stored it.
      expect(genres(['Comedy', 'Space Opera']).textContent).toBe(`${i18n.t('shows.genre.comedy')}, Space Opera`);
      expect(i18n.t('shows.genre.comedy')).not.toBe('Comedy');
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('draws nothing without genres', () => {
    expect(genres(undefined).innerHTML).toBe('');
    unmount?.();
    expect(genres([]).innerHTML).toBe('');
  });
});

describe('Tags', () => {
  function tags(list: string[] | undefined, onTag: (tag: string) => void = noop): HTMLElement {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<Tags tags={list} onTag={onTag} />));
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    return host;
  }

  it('draws a chip per tag, as typed, each named for what it does', () => {
    const host = tags(['Bad movie', 'סרט רע']);
    const chips = [...host.querySelectorAll('button')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['Bad movie', 'סרט רע']);
    expect(chips[0]?.getAttribute('aria-label')).toBe('Show only shows tagged Bad movie');
    expect(host.querySelector('[role="list"]')?.children).toHaveLength(2);
  });

  it('asks for the filter when pressed', () => {
    const pressed: string[] = [];
    const host = tags(['Bad movie', 'Christmas'], (tag) => pressed.push(tag));
    act(() => [...host.querySelectorAll('button')][1]?.click());
    expect(pressed).toEqual(['Christmas']);
  });

  it('draws nothing without tags', () => {
    expect(tags(undefined).innerHTML).toBe('');
    unmount?.();
    expect(tags([]).innerHTML).toBe('');
  });
});

describe('ShowCard', () => {
  it('follows a change of language, although it is memoised', async () => {
    const alex: Member = { id: 'm1', familyId: 'f', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };
    const show: Show = {
      id: 's1', familyId: 'f', createdAt: '2026-10-04T08:00:00.000Z', updatedAt: '2026-10-04T08:00:00.000Z',
      imdbId: 'tt0386676', kind: 'series', title: 'The Office', fetchedAt: '2026-10-04T08:00:00.000Z', status: 'to-watch',
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <SessionContext.Provider value={{ store: createLocalStore('f'), me: alex, members: [alex], signOut: async () => {} }}>
          <ShowCard show={show} onTag={noop} onEditTags={noop} />
        </SessionContext.Provider>,
      ),
    );
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    const status = (): string => host.querySelector('button[aria-label]')?.textContent ?? '';
    expect(status()).toBe('To watch');
    try {
      await loadLocale('he');
      await act(async () => {
        await i18n.changeLanguage('he');
      });
      expect(status()).toBe(i18n.t('shows.status.toWatch'));
      expect(status()).not.toBe('To watch');
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('stars a show from the star on its poster, and unstars it', async () => {
    localStorage.clear();
    const alex: Member = { id: 'm1', familyId: 'f', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };
    const store = createLocalStore('f-star');
    const created = await store.shows.create({ imdbId: 'tt0072901', kind: 'movie', title: 'Dolemite', fetchedAt: '2026-10-04T08:00:00.000Z', status: 'to-watch' });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = (show: Show): void =>
      act(() =>
        root.render(
          <SessionContext.Provider value={{ store, me: alex, members: [alex], signOut: async () => {} }}>
            <ShowCard show={show} onTag={noop} onEditTags={noop} />
          </SessionContext.Provider>,
        ),
      );
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    const star = (): HTMLButtonElement | null => host.querySelector<HTMLButtonElement>('button[aria-pressed]');
    const press = async (): Promise<Show> => {
      await act(async () => star()?.click());
      const [stored] = await store.shows.list();
      render(stored as Show);
      return stored as Show;
    };

    render(created);
    expect(star()?.getAttribute('aria-label')).toBe('Favourite: Dolemite');
    expect(star()?.getAttribute('aria-pressed')).toBe('false');
    expect((await press()).favorite).toBe(true);
    expect(star()?.getAttribute('aria-pressed')).toBe('true');
    expect((await press()).favorite).toBe(false);
    expect(star()?.getAttribute('aria-pressed')).toBe('false');
  });

  it("shows the details' actions as icons, each named and with its name as a tooltip", () => {
    const alex: Member = { id: 'm1', familyId: 'f', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };
    const show: Show = {
      id: 's1', familyId: 'f', createdAt: '2026-10-04T08:00:00.000Z', updatedAt: '2026-10-04T08:00:00.000Z',
      imdbId: 'tt0386676', kind: 'series', title: 'The Office', fetchedAt: '2026-10-04T08:00:00.000Z', status: 'to-watch',
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = (row: Show): void =>
      act(() =>
        root.render(
          <SessionContext.Provider value={{ store: createLocalStore('f'), me: alex, members: [alex], signOut: async () => {} }}>
            <ShowCard show={row} onTag={noop} onEditTags={noop} />
          </SessionContext.Provider>,
        ),
      );
    unmount = () => {
      act(() => root.unmount());
      host.remove();
    };
    render(show);
    act(() => host.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click());
    const actions = (): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('[id] button')];
    const names = [i18n.t('shows.tags.edit'), i18n.t('shows.card.refresh'), i18n.t('shows.card.drop'), i18n.t('shows.card.delete')];
    expect(actions().map((b) => b.getAttribute('aria-label'))).toEqual(names);
    expect(actions().map((b) => b.title)).toEqual(names);
    // Icons only: no words on the buttons themselves.
    expect(actions().map((b) => b.textContent)).toEqual(['', '', '', '']);

    // A dropped show offers Restore in Drop it's place.
    render({ ...show, status: 'dropped' });
    expect(actions()[2]?.getAttribute('aria-label')).toBe(i18n.t('shows.card.restore'));
  });
});
