import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SessionContext } from '../../auth/session';
import type { Session } from '../../auth/session';
import { ThemeProvider } from '../../components/theme/theme';
import { createLocalStore } from '../../data/local/localStore';
import type { Member } from '../../domain/types';
import { LocaleProvider, i18n } from '../../i18n';
import { BoardPage } from '../board/BoardPage';
import { FamilyPage } from './FamilyPage';

/*
 * The invite copy renders only for a real family, which the demo backend never
 * has, so these pages are rendered here with a signed-in session's shape.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alex: Member = { id: 'm-alex', familyId: 'f-test', name: 'Alex', color: '#4f8ef7', createdAt: '', updatedAt: '' };
const sam: Member = { id: 'm-sam', familyId: 'f-test', name: 'Sam', color: '#e8734a', createdAt: '', updatedAt: '' };

function signedIn(members: Member[]): Session {
  return {
    store: createLocalStore('f-test'),
    me: alex,
    members,
    signOut: async () => {},
    family: { id: 'f-test', name: 'The Okafors', joinCode: 'K7Q2MX' },
    rotateJoinCode: async () => {},
    refreshFamily: async () => {},
  };
}

let unmount: (() => void) | null = null;

async function render(node: ReactNode, session: Session): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <ThemeProvider>
          <SessionContext.Provider value={session}>
            <MemoryRouter>{node}</MemoryRouter>
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
});

afterEach(() => {
  unmount?.();
  unmount = null;
  localStorage.clear();
});

describe('the family page with a real family', () => {
  it('shows the link, the code and that the code is not a password', async () => {
    const page = await render(<FamilyPage />, signedIn([alex, sam]));
    const text = page.textContent ?? '';
    expect(text).toContain('The Okafors');
    expect(text).toContain('K7Q2MX');
    expect(text).toContain('/join/K7Q2MX');
    expect(text).toContain(i18n.t('family.invite.howTo'));
    expect(i18n.t('family.invite.howTo')).toMatch(/password/);
    expect(text).toContain(i18n.t('family.invite.orCode'));
    expect([...page.querySelectorAll('button')].map((button) => button.textContent)).toContain(i18n.t('family.invite.newCode'));
  });

  it('keeps theme and language together under this device', async () => {
    const page = await render(<FamilyPage />, signedIn([alex, sam]));
    const device = page.querySelector('[aria-labelledby="device-title"]');
    expect(device?.querySelector('h2')?.textContent).toBe(i18n.t('family.device'));
    expect(device?.querySelector(`[aria-label="${i18n.t('theme.label')}"]`)).not.toBeNull();
    expect(device?.textContent).toContain(i18n.t('locale.title'));
  });
});

describe('the board while you are the only member', () => {
  it('offers the code and a way to the invite link', async () => {
    const page = await render(<BoardPage />, signedIn([alex]));
    const invite = page.querySelector('.invite');
    expect(invite?.querySelector('code')?.textContent).toBe('K7Q2MX');
    expect(invite?.querySelector('a')?.getAttribute('href')).toBe('/family');
  });

  it('says nothing about inviting once someone has joined', async () => {
    const page = await render(<BoardPage />, signedIn([alex, sam]));
    expect(page.querySelector('.invite')).toBeNull();
  });
});
