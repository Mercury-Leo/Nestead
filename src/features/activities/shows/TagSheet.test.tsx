import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionContext } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import { useCollectionState } from '../../../data/useCollection';
import type { Member, Show } from '../../../domain/types';
import { i18n, localeReady } from '../../../i18n';
import { TagSheet } from './TagSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alex: Member = { id: 'm1', familyId: 'f-tags', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };
let store: DataStore;
let unmount: (() => void) | null = null;

/** The sheet for one show, fed live rows as the page feeds it. */
function Harness({ id }: { id: string }): JSX.Element | null {
  const { rows } = useCollectionState(store.shows);
  const show = rows.find((row) => row.id === id);
  return show === undefined ? null : <TagSheet show={show} shows={rows} onClose={() => undefined} />;
}

async function add(title: string, tags: string[]): Promise<Show> {
  return store.shows.create({ imdbId: `tt${String(5000000 + title.length)}${title.charCodeAt(0)}`, kind: 'movie', title, fetchedAt: '2026-10-05T08:00:00.000Z', status: 'to-watch', tags });
}

async function open(show: Show): Promise<HTMLDialogElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <SessionContext.Provider value={{ store, me: alex, members: [alex], signOut: async () => {} }}>
        <Harness id={show.id} />
      </SessionContext.Provider>,
    ),
  );
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  for (let i = 0; i < 50 && document.querySelector('dialog[open]') === null; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return document.querySelector('dialog[open]') as HTMLDialogElement;
}

const chips = (sheet: HTMLElement): HTMLButtonElement[] => [...sheet.querySelectorAll<HTMLButtonElement>('[role="group"] button')];
const names = (sheet: HTMLElement): string[] => chips(sheet).map((b) => b.textContent ?? '');
const pressed = (sheet: HTMLElement): string[] => chips(sheet).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent ?? '');
const field = (sheet: HTMLElement): HTMLInputElement => sheet.querySelector('input') as HTMLInputElement;
const saved = async (id: string): Promise<string[] | undefined> => (await store.shows.list()).find((row) => row.id === id)?.tags;

async function type(sheet: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field(sheet), text);
    field(sheet).dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function enter(sheet: HTMLElement): Promise<void> {
  await act(async () => {
    sheet.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeAll(async () => {
  await localeReady;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  localStorage.clear();
  store = createLocalStore('f-tags');
});

afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('TagSheet', () => {
  it("offers every family tag A to Z, pressed for this show's", async () => {
    await add('Sharknado', ['Movie night', 'Bad movie']);
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    expect(sheet.querySelector('h2')?.textContent).toBe('Tags for Elf');
    expect(names(sheet)).toEqual(['Bad movie', 'Christmas', 'Movie night']);
    expect(pressed(sheet)).toEqual(['Christmas']);
  });

  it('adds a new tag typed, with Enter or Add, and clears the field', async () => {
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    await type(sheet, '  Cult   classic ');
    expect(names(sheet)[0]).toBe(i18n.t('shows.tags.add', { tag: 'Cult classic' }));
    await enter(sheet);
    expect(await saved(elf.id)).toEqual(['Christmas', 'Cult classic']);
    expect(field(sheet).value).toBe('');
    expect(pressed(sheet)).toEqual(['Christmas', 'Cult classic']);

    await type(sheet, 'Feel good');
    await act(async () => chips(sheet)[0]?.click());
    expect(await saved(elf.id)).toEqual(['Christmas', 'Cult classic', 'Feel good']);
  });

  it("uses the family's spelling for a known tag typed in another case", async () => {
    await add('Sharknado', ['Bad movie']);
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    await type(sheet, 'bad MOVIE');
    // Known: no Add chip, just the match.
    expect(names(sheet)).toEqual(['Bad movie']);
    await enter(sheet);
    expect(await saved(elf.id)).toEqual(['Christmas', 'Bad movie']);
  });

  it('narrows the tags to what is typed', async () => {
    await add('Sharknado', ['Bad movie', 'Movie night']);
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    await type(sheet, 'mov');
    expect(names(sheet)).toEqual([i18n.t('shows.tags.add', { tag: 'mov' }), 'Bad movie', 'Movie night']);
  });

  it('keeps a tag taken off its last show until the sheet closes', async () => {
    const elf = await add('Elf', ['Christmas']);
    const sheet = await open(elf);
    await act(async () => chips(sheet)[0]?.click());
    expect(await saved(elf.id)).toEqual([]);
    expect(names(sheet)).toEqual(['Christmas']);
    expect(pressed(sheet)).toEqual([]);
    await act(async () => chips(sheet)[0]?.click());
    expect(await saved(elf.id)).toEqual(['Christmas']);
  });

  it("shows a tag spelled another way as pressed, and takes the show's own spelling off", async () => {
    // The family spells it "Bad movie" (its first show); Elf has "bad movie".
    await add('Sharknado', ['Bad movie']);
    const elf = await add('Elf', ['bad movie']);
    const sheet = await open(elf);
    expect(names(sheet)).toEqual(['Bad movie']);
    expect(pressed(sheet)).toEqual(['Bad movie']);
    await act(async () => chips(sheet)[0]?.click());
    expect(await saved(elf.id)).toEqual([]);
    expect(pressed(sheet)).toEqual([]);
  });

  it('stops at 20 tags', async () => {
    const full = await add('Full', Array.from({ length: 20 }, (_, i) => `T${String(i).padStart(2, '0')}`));
    const sheet = await open(full);
    expect(field(sheet).disabled).toBe(true);
    expect(sheet.textContent).toContain(i18n.t('shows.tags.full', { max: 20 }));
  });

  it('invites a first tag when the family has none', async () => {
    const elf = await add('Elf', []);
    const sheet = await open(elf);
    expect(sheet.textContent).toContain(i18n.t('shows.tags.firstHint'));
    expect(chips(sheet)).toHaveLength(0);
  });
});
