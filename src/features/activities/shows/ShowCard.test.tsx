import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SessionContext } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { FetchedDetails } from '../../../domain/shows';
import type { Member, Show } from '../../../domain/types';
import { i18n, loadLocale, localeReady } from '../../../i18n';
import { Facts, ShowCard, sameShow } from './ShowCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
          <ShowCard show={show} />
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
});
