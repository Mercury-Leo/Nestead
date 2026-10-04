import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../../auth/session';
import type { Session } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import { appleMapsUrl, geoUrl, googleMapsUrl } from '../../../domain/addresses/links';
import type { Member } from '../../../domain/types';
import { LocaleProvider, i18n } from '../../../i18n';
import { AddressesPage } from './AddressesPage';
import { DEBOUNCE_MS } from './StreetSuggestions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alex: Member = { id: 'm-alex', familyId: 'f-test', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };

const AGENTS = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
};

/** Pretends to be a device, by user agent and touch points. */
function device(agent: string, touchPoints = 0): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
  // jsdom has no maxTouchPoints to spy on.
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
}
let store: DataStore;
let unmount: (() => void) | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(): Promise<HTMLElement> {
  const session: Session = { store, me: alex, members: [alex], signOut: async () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <SessionContext.Provider value={session}>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AddressesPage />
          </MemoryRouter>
        </SessionContext.Provider>
      </LocaleProvider>,
    );
  });
  await flush();
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

/** Types into a React-controlled input. */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(element: Element | null | undefined): Promise<void> {
  expect(element).toBeTruthy();
  await act(async () => {
    (element as HTMLElement).click();
  });
  await flush();
}

const byLabel = (host: ParentNode, label: string): HTMLInputElement =>
  [...host.querySelectorAll('label')].find((node) => node.textContent === label)?.control as HTMLInputElement;
const button = (host: ParentNode, name: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((node) => node.textContent === name || node.getAttribute('aria-label') === name);
const names = (host: HTMLElement): string[] => [...host.querySelectorAll('li h2')].map((node) => node.textContent ?? '');
const openDialog = (): HTMLDialogElement | null => document.querySelector('dialog[open]');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  store = createLocalStore('f-test');
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
  localStorage.clear();
});

const herzl = { name: 'Grandma', street: 'Herzl 12', city: 'Tel Aviv', apartment: '4', doorCode: '5813#' };

describe('the address book', () => {
  it('starts empty, without a search bar, and adds an address once the required fields are in', async () => {
    const host = await render();
    expect(host.textContent).toContain(i18n.t('addresses.empty.title'));
    expect(host.querySelector('input[type="search"]')).toBeNull();

    await click(button(host, i18n.t('addresses.add')));
    const form = openDialog() as HTMLDialogElement;
    await click(button(form, i18n.t('addresses.add')));
    expect(form.textContent).toContain(i18n.t('addresses.form.nameMissing'));
    expect(form.textContent).toContain(i18n.t('addresses.form.streetMissing'));
    expect(form.textContent).toContain(i18n.t('addresses.form.cityMissing'));
    expect(await store.addresses.list()).toEqual([]);

    await type(byLabel(form, i18n.t('addresses.form.name')), '  Grandma ');
    await type(byLabel(form, i18n.t('addresses.form.street')), 'Herzl 12');
    await type(byLabel(form, i18n.t('addresses.form.city')), 'Tel Aviv');
    await type(byLabel(form, i18n.t('addresses.form.doorCode')), '5813#');
    await click(button(form, i18n.t('addresses.add')));

    const [saved] = await store.addresses.list();
    expect(saved).toMatchObject({ name: 'Grandma', street: 'Herzl 12', city: 'Tel Aviv', doorCode: '5813#', createdBy: 'm-alex' });
    expect(saved?.apartment).toBeUndefined();
    expect(names(host)).toEqual(['Grandma']);
  });

  it('searches by name, street or city, forgiving typos, and Escape clears it', async () => {
    await store.addresses.create(herzl);
    await store.addresses.create({ name: "Dana's house", street: 'Ben Yehuda 5', city: 'Tel Aviv' });
    await store.addresses.create({ name: 'Office', street: 'Dizengoff 50', city: 'Herzliya' });
    const host = await render();
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    expect(names(host)).toEqual(["Dana's house", 'Grandma', 'Office']);

    await type(search, 'herzel');
    expect(names(host)).toEqual(['Grandma']);
    // Herzl the street, exactly, before Herzliya the city, by prefix.
    await type(search, 'herzl');
    expect(names(host)).toEqual(['Grandma', 'Office']);
    await type(search, 'herzlia');
    expect(names(host)).toEqual(['Office']);
    await type(search, 'dana');
    expect(names(host)).toEqual(["Dana's house"]);

    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(search.value).toBe('');
    expect(names(host)).toHaveLength(3);

    await type(search, 'nowhere');
    expect(host.textContent).toContain(i18n.t('addresses.noMatches'));
    await click(button(host, i18n.t('addresses.clearSearch')));
    expect(names(host)).toHaveLength(3);
  });

  const navigateLink = (host: HTMLElement): HTMLAnchorElement =>
    host.querySelector(`a[aria-label="${i18n.t('addresses.navigateTo', { name: 'Grandma' })}"]`) as HTMLAnchorElement;

  it("on Android, Navigate is a geo: link for the system's app chooser, in the same tab", async () => {
    device(AGENTS.android, 5);
    const address = await store.addresses.create(herzl);
    const host = await render();
    const navigate = navigateLink(host);
    expect(navigate.getAttribute('href')).toBe(geoUrl(address));
    expect(navigate.hasAttribute('target')).toBe(false);
    expect(openDialog()).toBeNull();
    for (const a of document.querySelectorAll('a')) expect(decodeURIComponent(a.href)).not.toContain('5813');
  });

  it('on an iPhone, and an iPad that calls itself a Mac, Navigate opens Apple Maps', async () => {
    const address = await store.addresses.create(herzl);
    for (const [agent, touch] of [[AGENTS.iphone, 5], [AGENTS.mac, 5]] as const) {
      device(agent, touch);
      const host = await render();
      expect(navigateLink(host).getAttribute('href'), agent).toBe(appleMapsUrl(address));
      expect(navigateLink(host).target).toBe('_blank');
      unmount?.();
      unmount = null;
    }
  });

  it('on a computer, Navigate is one Google Maps link in a new tab', async () => {
    const address = await store.addresses.create(herzl);
    for (const agent of [AGENTS.windows, AGENTS.mac]) {
      device(agent);
      const host = await render();
      const navigate = navigateLink(host);
      expect(navigate.getAttribute('href'), agent).toBe(googleMapsUrl(address));
      expect(navigate.target).toBe('_blank');
      expect(navigate.rel).toBe('noopener noreferrer');
      unmount?.();
      unmount = null;
    }
  });

  it('asks before deleting', async () => {
    await store.addresses.create(herzl);
    const host = await render();
    await click(button(host, i18n.t('addresses.deleteLabel', { name: 'Grandma' })));
    await click(button(openDialog() as HTMLDialogElement, i18n.t('common.keepIt')));
    expect(await store.addresses.list()).toHaveLength(1);

    await click(button(host, i18n.t('addresses.deleteLabel', { name: 'Grandma' })));
    await click(button(openDialog() as HTMLDialogElement, i18n.t('common.delete')));
    expect(await store.addresses.list()).toEqual([]);
  });

  it('edits an address, and a blanked optional field is cleared', async () => {
    await store.addresses.create(herzl);
    const host = await render();
    await click(button(host, i18n.t('addresses.editLabel', { name: 'Grandma' })));
    const form = openDialog() as HTMLDialogElement;
    expect(byLabel(form, i18n.t('addresses.form.doorCode')).value).toBe('5813#');
    await type(byLabel(form, i18n.t('addresses.form.doorCode')), '');
    await type(byLabel(form, i18n.t('addresses.form.street')), 'Herzl 14');
    await click(button(form, i18n.t('common.save')));

    const [saved] = await store.addresses.list();
    expect(saved?.street).toBe('Herzl 14');
    expect(saved?.doorCode).toBeUndefined();
    expect(saved?.apartment).toBe('4');
  });

  describe('address suggestions', () => {
    const SUGGESTIONS = {
      results: [
        { street: 'Herzl 12', city: 'Rishon LeZion', country: 'Israel' },
        { street: 'Herzl 12', city: 'Haifa', country: 'Israel' },
      ],
      attribution: '© OpenStreetMap contributors',
    };

    /** Lets the typing pause pass, and the answer arrive. */
    async function pause(): Promise<void> {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 50));
      });
      await flush();
    }

    async function openForm(fetchMock: ReturnType<typeof vi.fn>): Promise<{ form: HTMLDialogElement; street: HTMLInputElement }> {
      vi.stubGlobal('fetch', fetchMock);
      const host = await render();
      await click(button(host, i18n.t('addresses.add')));
      const form = openDialog() as HTMLDialogElement;
      return { form, street: byLabel(form, i18n.t('addresses.form.street')) };
    }

    const options = (form: HTMLElement): HTMLElement[] => [...form.querySelectorAll<HTMLElement>('[role="option"]')];
    const key = async (input: HTMLInputElement, name: string): Promise<KeyboardEvent> => {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
      await act(async () => {
        input.dispatchEvent(event);
      });
      return event;
    };

    it('suggests after a pause in typing, and a pick fills the street and city', async () => {
      const fetchMock = vi.fn(async (_input: string) => new Response(JSON.stringify(SUGGESTIONS), { status: 200 }));
      const { form, street } = await openForm(fetchMock);
      expect(street.getAttribute('role')).toBe('combobox');

      await type(street, 'he');
      await pause();
      expect(fetchMock).not.toHaveBeenCalled();

      await type(street, 'herz');
      await type(street, 'herzl 12');
      await pause();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/places?q=${encodeURIComponent('herzl 12')}`);
      expect(street.getAttribute('aria-expanded')).toBe('true');
      expect(options(form).map((option) => option.textContent)).toEqual(['Herzl 12Rishon LeZion, Israel', 'Herzl 12Haifa, Israel']);
      expect(form.textContent).toContain('© OpenStreetMap contributors');

      await key(street, 'ArrowDown');
      await key(street, 'ArrowDown');
      expect(street.getAttribute('aria-activedescendant')).toBe(options(form)[1]?.id);
      const enter = await key(street, 'Enter');
      expect(enter.defaultPrevented).toBe(true);
      expect(street.value).toBe('Herzl 12');
      expect(byLabel(form, i18n.t('addresses.form.city')).value).toBe('Haifa');
      expect(options(form)).toEqual([]);
      expect(await store.addresses.list()).toEqual([]);
    });

    it('asks with the city once it is filled in, and never with the name, apartment or door code', async () => {
      const fetchMock = vi.fn(async (_input: string) => new Response(JSON.stringify({ results: [] }), { status: 200 }));
      const { form, street } = await openForm(fetchMock);
      await type(byLabel(form, i18n.t('addresses.form.name')), 'Secret name');
      await type(byLabel(form, i18n.t('addresses.form.city')), 'Haifa');
      await type(byLabel(form, i18n.t('addresses.form.apartment')), '77');
      await type(byLabel(form, i18n.t('addresses.form.doorCode')), '9911#');
      await type(street, 'הרצל 12');
      await pause();
      const url = decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]));
      expect(url).toBe('/api/places?q=הרצל 12, Haifa');
      expect(url).not.toMatch(/Secret|77|9911/);
    });

    it('closes the list on a click, and Escape closes only the list', async () => {
      const fetchMock = vi.fn(async (_input: string) => new Response(JSON.stringify(SUGGESTIONS), { status: 200 }));
      const { form, street } = await openForm(fetchMock);
      await type(street, 'herzl 12');
      await pause();
      const escape = await key(street, 'Escape');
      expect(escape.defaultPrevented).toBe(true);
      expect(options(form)).toEqual([]);
      expect(openDialog()).toBe(form);

      await type(street, 'herzl 1');
      await pause();
      await click(options(form)[0]);
      expect(street.value).toBe('Herzl 12');
      expect(byLabel(form, i18n.t('addresses.form.city')).value).toBe('Rishon LeZion');
    });

    it('shows nothing when the service fails, and the address can still be typed and saved', async () => {
      const fetchMock = vi.fn(async (_input: string) => new Response(JSON.stringify({ error: 'places-failed' }), { status: 502 }));
      const { form, street } = await openForm(fetchMock);
      await type(byLabel(form, i18n.t('addresses.form.name')), 'Grandma');
      await type(street, 'Herzl 12');
      await pause();
      expect(fetchMock).toHaveBeenCalled();
      expect(options(form)).toEqual([]);
      expect(street.getAttribute('aria-expanded')).toBe('false');
      await type(byLabel(form, i18n.t('addresses.form.city')), 'Tel Aviv');
      await click(button(form, i18n.t('addresses.add')));
      expect((await store.addresses.list())[0]).toMatchObject({ street: 'Herzl 12', city: 'Tel Aviv' });
    });

    it('does not ask when an address is opened for editing, only once its street is typed in', async () => {
      const fetchMock = vi.fn(async (_input: string) => new Response(JSON.stringify(SUGGESTIONS), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      await store.addresses.create(herzl);
      const host = await render();
      await click(button(host, i18n.t('addresses.editLabel', { name: 'Grandma' })));
      await pause();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
