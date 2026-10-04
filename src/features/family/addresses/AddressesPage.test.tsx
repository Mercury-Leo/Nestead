import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../../auth/session';
import type { Session } from '../../../auth/session';
import { createLocalStore } from '../../../data/local/localStore';
import type { DataStore } from '../../../data/types';
import { googleMapsUrl, wazeUrl } from '../../../domain/addresses/links';
import type { Member } from '../../../domain/types';
import { LocaleProvider, i18n } from '../../../i18n';
import { AddressesPage } from './AddressesPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alex: Member = { id: 'm-alex', familyId: 'f-test', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };

let desktop = false;
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
  desktop = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width: 1024px') ? desktop : false,
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

  it('searches by name or street, forgiving typos, and Escape clears it', async () => {
    await store.addresses.create(herzl);
    await store.addresses.create({ name: "Dana's house", street: 'Ben Yehuda 5', city: 'Tel Aviv' });
    await store.addresses.create({ name: 'Office', street: 'Dizengoff 50', city: 'Herzliya' });
    const host = await render();
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    expect(names(host)).toEqual(["Dana's house", 'Grandma', 'Office']);

    await type(search, 'herzel');
    expect(names(host)).toEqual(['Grandma']);
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

  it('on a phone, Navigate offers Waze and Google Maps, with no door code in any link', async () => {
    const address = await store.addresses.create(herzl);
    const host = await render();
    await click(button(host, i18n.t('addresses.navigateTo', { name: 'Grandma' })));
    const sheet = openDialog() as HTMLDialogElement;
    const links = [...sheet.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual([i18n.t('addresses.waze'), i18n.t('addresses.googleMaps')]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([wazeUrl(address), googleMapsUrl(address)]);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
    }
    for (const a of document.querySelectorAll('a')) expect(decodeURIComponent(a.href)).not.toContain('5813');
  });

  it('on desktop, Navigate is one Google Maps link in a new tab', async () => {
    desktop = true;
    const address = await store.addresses.create(herzl);
    const host = await render();
    const navigate = host.querySelector(`a[aria-label="${i18n.t('addresses.navigateTo', { name: 'Grandma' })}"]`) as HTMLAnchorElement;
    expect(navigate.getAttribute('href')).toBe(googleMapsUrl(address));
    expect(navigate.target).toBe('_blank');
    expect(button(host, i18n.t('addresses.navigateTo', { name: 'Grandma' }))).toBeUndefined();
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
});
