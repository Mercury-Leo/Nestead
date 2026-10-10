import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalStore } from '../data/local/localStore';
import type { Account, ChangeListener, Collection, Family } from '../data/types';
import type { Member, NewRow } from '../domain/types';
import { LocaleProvider, i18n } from '../i18n';
import { AccountSession } from './accountSession';
import { rememberFamily } from './openFamily';
import { useSession } from './session';

/*
 * AccountSession against a backend that is not Supabase: an in-memory Account
 * over the local store. If the session or its screens reached past the Account
 * interface, this would not run.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Members keyed by user id, which the local store cannot do: it picks ids itself. */
function memberCollection(rows: Member[]): Collection<Member> {
  const listeners = new Set<ChangeListener>();
  const notify = (): void => listeners.forEach((listener) => listener());
  return {
    list: async () => [...rows],
    create: async () => {
      throw new Error('members are added by joining');
    },
    update: async (id, patch: Partial<NewRow<Member>>) => {
      const row = rows.find((member) => member.id === id)!;
      Object.assign(row, patch);
      notify();
      return row;
    },
    remove: async (id) => {
      rows.splice(rows.findIndex((member) => member.id === id), 1);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function fakeAccount(options: { recovery?: boolean } = {}) {
  let userId: string | null = null;
  let watcher: ((userId: string | null, recovery: boolean) => void) | null = null;
  const families = new Map<string, Family>();
  const members: Member[] = [];
  let codes = 0;
  let membershipFailures = 0;

  const addMember = (familyId: string, name: string): void => {
    members.push({ id: userId!, familyId, name, color: '#4f8ef7', createdAt: '', updatedAt: '' });
  };

  const account: Account = {
    watchUser(onChange) {
      watcher = onChange;
      queueMicrotask(() => onChange(userId, false));
      return () => {
        watcher = null;
      };
    },
    takeRecoveryLink: () => options.recovery === true,
    takeLinkError: () => null,
    rememberMe: () => true,
    signIn: async () => {},
    signUp: async () => 'signedIn',
    sendPasswordReset: async () => {},
    setPassword: async () => {},
    async signOut() {
      userId = null;
      watcher?.(null, false);
    },
    async readMembership(id) {
      if (membershipFailures > 0) {
        membershipFailures -= 1;
        throw new Error('Failed to fetch');
      }
      const member = members.find((row) => row.id === id);
      return member === undefined ? null : families.get(member.familyId)!;
    },
    readFamily: async (familyId) => families.get(familyId)!,
    async createFamily(familyName, displayName) {
      const id = `f-${families.size + 1}`;
      families.set(id, { id, name: familyName, joinCode: `CODE${(codes += 1)}` });
      addMember(id, displayName);
    },
    async joinFamily(code, displayName) {
      const family = [...families.values()].find((row) => row.joinCode === code);
      if (family === undefined) throw new Error('No family has that code.');
      addMember(family.id, displayName);
    },
    async rotateJoinCode() {
      const family = families.get(members.find((row) => row.id === userId)!.familyId)!;
      family.joinCode = `CODE${(codes += 1)}`;
      return family.joinCode;
    },
    inviteFamilyName: async (code) => [...families.values()].find((row) => row.joinCode === code)?.name ?? null,
    accessToken: async () => (userId === null ? null : `token-${userId}`),
    aiStatus: async () => ({ free: { used: 0, limit: 5, left: 5 } }),
    clearAiKey: async () => {},
    setAiModel: async () => {},
    openStore: (familyId) => ({ ...createLocalStore(familyId), members: memberCollection(members.filter((row) => row.familyId === familyId)) }),
  };

  return {
    account,
    /** Puts a user in a new family before they sign in. */
    inFamily(id: string, name: string, familyName: string) {
      const previous = userId;
      userId = id;
      void account.createFamily(familyName, name);
      userId = previous;
    },
    signInAs(id: string) {
      userId = id;
      watcher?.(id, false);
    },
    /** The next reads of membership fail, as with no connection. */
    failMembership(times: number) {
      membershipFailures = times;
    },
  };
}

function SignedIn(): JSX.Element {
  const { me, family, rotateJoinCode } = useSession();
  return (
    <p>
      {me.name} in {family?.name} with {family?.joinCode}
      <button type="button" onClick={() => void rotateJoinCode?.()}>
        rotate
      </button>
    </p>
  );
}

/** Shows what Session.ai reaches: the account's token, once it has answered. */
function AiToken(): JSX.Element {
  const { ai } = useSession();
  const [token, setToken] = useState('none yet');
  useEffect(() => {
    void ai?.token().then((value) => setToken(String(value)));
  }, [ai]);
  return <p>token: {token}</p>;
}

let unmount: (() => void) | null = null;

async function render(account: Account, screen: JSX.Element = <SignedIn />): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <LocaleProvider>
        <AccountSession account={account}>{screen}</AccountSession>
      </LocaleProvider>,
    );
  });
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}

/** Lets the session's async steps (membership, store setup) finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

function type(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  unmount?.();
  unmount = null;
  localStorage.clear();
});

describe('AccountSession on another backend', () => {
  it('shows sign-in to someone signed out', async () => {
    const page = await render(fakeAccount().account);
    await settle();
    expect(page.querySelector('input[type="email"]')).not.toBeNull();
  });

  it('takes a new account through creating a family to the app', async () => {
    const fake = fakeAccount();
    const page = await render(fake.account);
    await act(async () => fake.signInAs('u-alex'));
    await settle();
    expect(page.textContent).toContain(i18n.t('auth.join.subtitleCreate'));

    const [name, family] = [...page.querySelectorAll('input')] as HTMLInputElement[];
    await act(async () => {
      type(name!, 'Alex');
      type(family!, 'The Okafors');
    });
    await act(async () => page.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    await settle();

    expect(page.textContent).toContain('Alex in The Okafors with CODE1');
  });

  it('shows a rotated join code without signing in again', async () => {
    const fake = fakeAccount();
    fake.inFamily('u-sam', 'Sam', 'The Levis');
    const page = await render(fake.account);
    await act(async () => fake.signInAs('u-sam'));
    await settle();
    expect(page.textContent).toContain('Sam in The Levis with CODE1');

    await act(async () => page.querySelector<HTMLButtonElement>('button[type="button"]')!.click());
    await settle();
    expect(page.textContent).toContain('Sam in The Levis with CODE2');
  });

  it('reaches the account through the session for AI calls', async () => {
    const fake = fakeAccount();
    fake.inFamily('u-sam', 'Sam', 'The Levis');
    const page = await render(fake.account, <AiToken />);
    await act(async () => fake.signInAs('u-sam'));
    await settle();
    expect(page.textContent).toContain('token: token-u-sam');
  });

  it('holds a password-reset link on choosing a new password', async () => {
    // The link has signed the person in by the time the session starts.
    const fake = fakeAccount({ recovery: true });
    fake.signInAs('u-alex');
    const page = await render(fake.account);
    await settle();
    expect(page.textContent).toContain(i18n.t('auth.newPassword.subtitle'));
  });

  it('says the family could not be read, and opens it on Try again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fake = fakeAccount();
    fake.inFamily('u-sam', 'Sam', 'The Levis');
    fake.failMembership(1);
    const page = await render(fake.account);
    await act(async () => fake.signInAs('u-sam'));
    await settle();
    expect(page.textContent).toContain(i18n.t('loadFailed.title'));

    const retry = [...page.querySelectorAll('button')].find((button) => button.textContent === i18n.t('loadFailed.retry'))!;
    await act(async () => retry.click());
    await settle();
    expect(page.textContent).toContain('Sam in The Levis with CODE1');
    vi.restoreAllMocks();
  });

  it('tries again by itself when the connection comes back, with the store it began', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fake = fakeAccount();
    fake.inFamily('u-sam', 'Sam', 'The Levis');
    // A device that opened this family before starts its store before membership answers.
    rememberFamily('u-sam', 'f-1');
    const opened: string[] = [];
    const openStore = fake.account.openStore;
    fake.account.openStore = (familyId) => {
      opened.push(familyId);
      return openStore(familyId);
    };
    fake.failMembership(1);
    const page = await render(fake.account);
    await act(async () => fake.signInAs('u-sam'));
    await settle();
    expect(page.textContent).toContain(i18n.t('loadFailed.title'));

    await act(async () => window.dispatchEvent(new Event('online')));
    await settle();
    expect(page.textContent).toContain('Sam in The Levis with CODE1');
    expect(opened).toEqual(['f-1']);
    vi.restoreAllMocks();
  });

  it('goes back to sign-in on signing out', async () => {
    const fake = fakeAccount();
    await render(fake.account);
    await act(async () => fake.signInAs('u-alex'));
    await settle();
    await act(() => fake.account.signOut());
    await settle();
    expect(document.querySelector('input[type="email"]')).not.toBeNull();
  });
});
