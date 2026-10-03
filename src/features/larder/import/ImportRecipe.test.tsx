import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../../auth/session';
import type { Session } from '../../../auth/session';
import { ThemeProvider } from '../../../components/theme/theme';
import { createLocalStore } from '../../../data/local/localStore';
import type { Member } from '../../../domain/types';
import { LocaleProvider, i18n } from '../../../i18n';
import ImportRecipe from './ImportRecipe';

/*
 * The import screen, with fetch stubbed per test: pasting recipe text, and
 * "Read it with AI" after a page the importer found no recipe in.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Only what the screen and the preview read: no pantry, no diet profile, no bundled search hits.
vi.mock('../KitchenContext', () => ({
  useKitchen: () => ({
    pantry: { have: new Set<string>(), staples: new Set<string>(), haveCount: 0, stapleCount: 0 },
    profile: null,
    provider: { search: async () => [] },
  }),
}));

const alex: Member = { id: 'm-alex', familyId: 'f-test', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };

type FamilyAi = NonNullable<Session['ai']>;

const freeAi: FamilyAi = {
  token: async () => 'tok',
  status: async () => ({ free: { used: 1, limit: 5, left: 4 } }),
  clearKey: async () => {},
  setModel: async () => {},
};

function session(ai?: FamilyAi): Session {
  return {
    store: createLocalStore('f-test'),
    me: alex,
    members: [alex],
    signOut: async () => {},
    family: { id: 'f-test', name: 'The Okafors', joinCode: 'K7Q2MX' },
    rotateJoinCode: async () => {},
    refreshFamily: async () => {},
    ...(ai !== undefined ? { ai } : {}),
  };
}

let unmount: (() => void) | null = null;

async function render(node: ReactNode, value: Session): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <ThemeProvider>
          <SessionContext.Provider value={value}>
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{node}</MemoryRouter>
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

beforeAll(() => {
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
  // jsdom has no layout, so no scrollIntoView; the screen scrolls a chosen result's preview into view.
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
  localStorage.clear();
});

type Reply = { body: unknown; status?: number };

/** A reply that is not given yet: the request waits until `answer` is called. */
function pending(): { reply: Promise<Reply>; answer: (reply: Reply) => void } {
  let answer: (reply: Reply) => void = () => {};
  const reply = new Promise<Reply>((resolve) => {
    answer = resolve;
  });
  return { reply, answer };
}

/** Answers each path from `routes`; a request to any other path fails the test. */
function stubFetch(routes: Record<string, Reply | Promise<Reply>>): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (input: unknown) => {
    const reply = await routes[String(input)];
    if (reply === undefined) throw new Error(`unexpected request to ${String(input)}`);
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** The [url, init] of every request made to `path`. */
const requestsTo = (fetch: ReturnType<typeof vi.fn>, path: string): [string, RequestInit][] =>
  (fetch.mock.calls as unknown as [string, RequestInit][]).filter(([url]) => url === path);

/** Lets promises and timers the screen is waiting on finish, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !done(); i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(done()).toBe(true);
}

function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

const buttons = (page: HTMLElement): HTMLButtonElement[] => [...page.querySelectorAll('button')];
const buttonNamed = (page: HTMLElement, name: string): HTMLButtonElement | undefined => buttons(page).find((button) => button.textContent?.trim() === name);

/** The labels of the "Import by" options. */
const importByOptions = (page: HTMLElement): string[] =>
  [...page.querySelectorAll(`[role="radiogroup"][aria-label="${i18n.t('import.importBy')}"] label`)].map((label) => label.textContent ?? '');

async function chooseMode(page: HTMLElement, mode: 'link' | 'search' | 'text'): Promise<void> {
  await act(async () => page.querySelector<HTMLInputElement>(`input[type="radio"][value="${mode}"]`)!.click());
}
const choosePasteText = (page: HTMLElement): Promise<void> => chooseMode(page, 'text');

async function fetchLink(page: HTMLElement, link: string): Promise<void> {
  await act(async () => typeInto(page.querySelector<HTMLInputElement>('input[type="url"]')!, link));
  await act(async () => page.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
}

const LINK = 'https://example.com/pasta';

const gnocchi = { title: 'Lemon Gnocchi', ingredients: ['200 g gnocchi', '1 lemon'], steps: ['Boil the gnocchi.', 'Toss with lemon.'], equipment: [] };
const report = { found: ['title', 'ingredients', 'steps'], missing: ['photo', 'times'] };

/** What /api/ai/extract answers with for pasted text: a recipe with no page behind it. */
const readText = { recipe: gnocchi, report };
/** And for a page: the same recipe, with the address and site it came from. */
const readPage = { recipe: { ...gnocchi, url: LINK, site: 'example.com' }, report };

const previewTitle = (page: HTMLElement): string | undefined => page.querySelector('#preview-title')?.textContent ?? undefined;
/** The line above the preview's title: the site a page was read from; none for pasted text. */
const aboveTitle = (page: HTMLElement): string | undefined => page.querySelector('#preview-title')?.previousElementSibling?.textContent ?? undefined;
const statusLine = (page: HTMLElement): string => page.querySelector('[aria-live]')?.textContent?.trim() ?? '';
/** Which source badges the preview shows over its photo: "Mine", "Web", both or neither. */
const sourceBadges = (page: HTMLElement): string[] => {
  const shown = [...page.querySelectorAll('section[aria-labelledby="preview-title"] span')].map((span) => span.textContent?.trim());
  return [i18n.t('recipe.badge.mine'), i18n.t('recipe.badge.web')].filter((label) => shown.includes(label));
};

describe('the import screen, by what the account can do', () => {
  it('offers Paste text to an account with AI', async () => {
    const page = await render(<ImportRecipe />, session(freeAi));
    expect(importByOptions(page)).toContain(i18n.t('import.pasteText'));
  });

  it('offers no Paste text without AI', async () => {
    const page = await render(<ImportRecipe />, session());
    expect(importByOptions(page)).toEqual([i18n.t('import.pasteLink'), i18n.t('import.searchOnline')]);
  });
});

describe('Paste text', () => {
  it('shows a labelled box that stops at 20,000 characters, the free reads left, and where the text goes', async () => {
    const page = await render(<ImportRecipe />, session(freeAi));
    await choosePasteText(page);

    const box = page.querySelector('textarea')!;
    expect(page.querySelector(`label[for="${box.id}"]`)?.textContent).toBe(i18n.t('import.textLabel'));
    expect(box.maxLength).toBe(20_000);
    expect(page.textContent).toContain(i18n.t('import.aiSent'));

    await until(() => (page.textContent ?? '').includes('4 of 5 left today'));
    expect(page.textContent).toContain(i18n.t('import.aiFree', { left: 4, limit: 5 }));
  });

  it('says so, in place of the count, when the family has its own key', async () => {
    const familyKey: FamilyAi = { ...freeAi, status: async () => ({ key: { hint: '1234', updatedAt: '2026-10-01T00:00:00Z' }, free: { used: 0, limit: 5, left: 5 } }) };
    const page = await render(<ImportRecipe />, session(familyKey));
    await choosePasteText(page);

    await until(() => (page.textContent ?? '').includes(i18n.t('import.aiFamilyKey')));
    expect(page.textContent).not.toContain('left today');
  });

  it('reads nothing until Read with AI is clicked, then shows the recipe and counts the read', async () => {
    const fetch = stubFetch({ '/api/ai/extract': { body: readText } });
    const status = vi.fn(async () => ({ free: { used: 1, limit: 5, left: 4 } }));
    const page = await render(<ImportRecipe />, session({ ...freeAi, status }));
    await choosePasteText(page);
    expect(buttonNamed(page, i18n.t('import.readWithAi'))!.disabled).toBe(true);

    await act(async () => typeInto(page.querySelector('textarea')!, '200 g gnocchi, 1 lemon. Boil, toss.'));
    expect(fetch).not.toHaveBeenCalled();
    const statusCalls = status.mock.calls.length;
    await act(async () => buttonNamed(page, i18n.t('import.readWithAi'))!.click());
    await until(() => previewTitle(page) !== undefined);

    expect(previewTitle(page)).toBe('Lemon Gnocchi');
    expect(page.textContent).toContain(i18n.t('import.read.byAi'));
    expect(statusLine(page)).toBe(i18n.t('import.readByAi'));
    // Text has no page, so no site to show above the title, and it is the family's own.
    expect(aboveTitle(page)).toBeUndefined();
    expect(sourceBadges(page)).toEqual([i18n.t('recipe.badge.mine')]);
    expect(requestsTo(fetch, '/api/ai/extract')).toHaveLength(1);
    expect(JSON.parse(requestsTo(fetch, '/api/ai/extract')[0]![1].body as string)).toEqual({ text: '200 g gnocchi, 1 lemon. Boil, toss.' });
    // The read used one of the free reads, so the line under the box is asked again.
    expect(status.mock.calls.length).toBeGreaterThan(statusCalls);
  });

  it('reads once while a read is pending, even when the buttons come back', async () => {
    const extract = pending();
    const fetch = stubFetch({ '/api/ai/extract': extract.reply });
    const page = await render(<ImportRecipe />, session(freeAi));
    await choosePasteText(page);
    await act(async () => typeInto(page.querySelector('textarea')!, 'Pancakes: 2 eggs, 1 cup flour. Whisk and fry.'));
    await act(async () => buttonNamed(page, i18n.t('import.readWithAi'))!.click());
    expect(requestsTo(fetch, '/api/ai/extract')).toHaveLength(1);

    // Switching tabs clears the status, which enables the button again: the read is still out.
    await chooseMode(page, 'link');
    await choosePasteText(page);
    expect(buttonNamed(page, i18n.t('import.readWithAi'))!.disabled).toBe(false);
    await act(async () => buttonNamed(page, i18n.t('import.readWithAi'))!.click());
    expect(requestsTo(fetch, '/api/ai/extract')).toHaveLength(1);

    await act(async () => extract.answer({ body: readText }));
    await until(() => previewTitle(page) !== undefined);
    expect(requestsTo(fetch, '/api/ai/extract')).toHaveLength(1);

    // And once it is done, the next read is allowed.
    await act(async () => buttonNamed(page, i18n.t('import.readWithAi'))!.click());
    expect(requestsTo(fetch, '/api/ai/extract')).toHaveLength(2);
  });

  it('says what went wrong, and shows no preview, when the free reads are used up', async () => {
    stubFetch({ '/api/ai/extract': { body: { error: 'quota-exceeded', scope: 'user' }, status: 429 } });
    const page = await render(<ImportRecipe />, session(freeAi));
    await choosePasteText(page);
    await act(async () => typeInto(page.querySelector('textarea')!, 'Pancakes: 2 eggs, 1 cup flour. Whisk and fry.'));
    await act(async () => buttonNamed(page, i18n.t('import.readWithAi'))!.click());

    await until(() => (page.textContent ?? '').includes('5 free AI reads'));
    expect(previewTitle(page)).toBeUndefined();
  });

  it('shows a line it cannot read a quantity in as the text it is, markup and all', async () => {
    // What a model wrote is never markup: not for React, and not for <Trans> either.
    const lines = ['<0>x</0> basil', '<_x>y</_x> salt', '<1/> pepper'];
    stubFetch({ '/api/ai/extract': { body: { ...readText, recipe: { ...gnocchi, ingredients: [...gnocchi.ingredients, ...lines] } } } });
    const page = await render(<ImportRecipe />, session(freeAi));
    await choosePasteText(page);
    await act(async () => typeInto(page.querySelector('textarea')!, 'Gnocchi with basil, salt and pepper.'));
    await act(async () => buttonNamed(page, i18n.t('import.readWithAi'))!.click());
    await until(() => previewTitle(page) !== undefined);

    const quoted = [...page.querySelectorAll('bdi')].map((bdi) => bdi.textContent);
    for (const line of lines) {
      expect(quoted).toContain(line);
      expect(page.textContent).toContain(`\u201c${line}\u201d`);
    }
  });
});

describe('Read it with AI', () => {
  it('is offered when the importer finds no recipe, and reads the same link', async () => {
    const fetch = stubFetch({
      '/api/import': { body: { error: 'not-found' }, status: 422 },
      '/api/ai/extract': { body: readPage },
    });
    const page = await render(<ImportRecipe />, session(freeAi));
    await fetchLink(page, LINK);
    await until(() => buttonNamed(page, i18n.t('import.readItWithAi')) !== undefined);
    expect(requestsTo(fetch, '/api/ai/extract')).toHaveLength(0);

    await act(async () => buttonNamed(page, i18n.t('import.readItWithAi'))!.click());
    await until(() => previewTitle(page) !== undefined);

    expect(previewTitle(page)).toBe('Lemon Gnocchi');
    expect(page.textContent).toContain(i18n.t('import.read.byAi'));
    expect(statusLine(page)).toBe(i18n.t('import.readByAiFrom', { site: 'example.com' }));
    expect(aboveTitle(page)).toBe('example.com');
    expect(sourceBadges(page)).toEqual([i18n.t('recipe.badge.web')]);
    const [[, init]] = requestsTo(fetch, '/api/ai/extract') as [[string, RequestInit]];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ url: LINK });
    // Gone once it has been read: the answer is the preview now.
    expect(buttonNamed(page, i18n.t('import.readItWithAi'))).toBeUndefined();
  });

  it('says Reading while it reads, whatever the tab', async () => {
    const extract = pending();
    stubFetch({ '/api/import': { body: { error: 'not-found' }, status: 422 }, '/api/ai/extract': extract.reply });
    const page = await render(<ImportRecipe />, session(freeAi));
    await fetchLink(page, LINK);
    await until(() => buttonNamed(page, i18n.t('import.readItWithAi')) !== undefined);
    await act(async () => buttonNamed(page, i18n.t('import.readItWithAi'))!.click());

    expect(statusLine(page)).toBe(i18n.t('import.reading'));
    expect(buttonNamed(page, i18n.t('import.readItWithAi'))).toBeUndefined();

    await act(async () => extract.answer({ body: readPage }));
    await until(() => previewTitle(page) !== undefined);
    expect(statusLine(page)).toBe(i18n.t('import.readByAiFrom', { site: 'example.com' }));
  });

  it.each(['blocked', 'invalid-url', 'timeout', 'too-large', 'fetch-failed'])('is not offered after %s, which AI could not fix', async (error) => {
    stubFetch({ '/api/import': { body: { error }, status: 400 } });
    const page = await render(<ImportRecipe />, session(freeAi));
    await fetchLink(page, LINK);
    await until(() => page.querySelector('[aria-live] p') !== null);

    expect(buttonNamed(page, i18n.t('import.readItWithAi'))).toBeUndefined();
  });

  it('is not offered to an account without AI', async () => {
    stubFetch({ '/api/import': { body: { error: 'not-found' }, status: 422 } });
    const page = await render(<ImportRecipe />, session());
    await fetchLink(page, LINK);
    await until(() => (page.textContent ?? '').includes(i18n.t('import.error.notFound')));

    expect(buttonNamed(page, i18n.t('import.readItWithAi'))).toBeUndefined();
  });
});
