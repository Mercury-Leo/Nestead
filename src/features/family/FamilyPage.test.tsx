import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../auth/session';
import type { Session } from '../../auth/session';
import { ThemeProvider } from '../../components/theme/theme';
import { createLocalStore } from '../../data/local/localStore';
import type { AiStatus, Member } from '../../domain/types';
import { LocaleProvider, formatDate, i18n } from '../../i18n';
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

type FamilyAi = NonNullable<Session['ai']>;

/** A signed-in session whose AI settings answer with `status` and record what changes in `calls`. */
function withAi(status: AiStatus, calls: string[] = [], ai: Partial<FamilyAi> = {}): Session {
  return {
    ...signedIn([alex, sam]),
    ai: {
      token: async () => 'tok',
      status: async () => status,
      clearKey: async () => {
        calls.push('clear');
      },
      setModel: async (model) => {
        calls.push(`model:${model}`);
      },
      ...ai,
    },
  };
}

/** The demo backend's shape: no family, no rotating a code, no AI. */
function demo(): Session {
  return { store: createLocalStore('f-test'), me: alex, members: [alex, sam], signOut: async () => {} };
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
  // jsdom has no modal dialogs; the Sheet opens and closes its <dialog> with these.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  unmount?.();
  unmount = null;
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
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

/* The AI assistant card: the free reads, the family's own key, and the model. */

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

/** Lets promises the card is waiting on finish, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !done(); i += 1) await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(done()).toBe(true);
}

function typeInto(field: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

const FREE: AiStatus['free'] = { used: 1, limit: 5, left: 4 };
const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef';
const UPDATED = '2026-10-03T10:00:00Z';
const withKey = (key: Partial<NonNullable<AiStatus['key']>> = {}): AiStatus => ({
  key: { hint: 'a3f2', setByName: 'Sam', updatedAt: UPDATED, ...key },
  free: FREE,
});

const card = (page: HTMLElement): HTMLElement => page.querySelector<HTMLElement>('[aria-labelledby="ai-title"]')!;
const cardText = (page: HTMLElement): string => card(page).textContent ?? '';
/** The card's own buttons, not the ones inside its sheets. */
const cardButton = (page: HTMLElement, name: string): HTMLButtonElement | undefined =>
  [...card(page).querySelectorAll('button')].find((button) => !button.closest('dialog') && button.textContent?.trim() === name);
const openSheet = (): HTMLDialogElement | null => document.querySelector<HTMLDialogElement>('dialog[open]');
const sheetButton = (name: string): HTMLButtonElement | undefined =>
  [...(openSheet()?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === name);
const keyField = (): HTMLInputElement => openSheet()!.querySelector<HTMLInputElement>('input')!;
const click = (button: HTMLButtonElement | undefined): Promise<void> => act(async () => button!.click());
const chooseModel = (page: HTMLElement, mode: 'free' | 'chosen'): Promise<void> =>
  act(async () => card(page).querySelector<HTMLInputElement>(`input[type="radio"][value="${mode}"]`)!.click());
/** The model id box, found by its label. */
const modelField = (page: HTMLElement): HTMLInputElement | null => {
  const label = [...card(page).querySelectorAll('label')].find((candidate) => candidate.textContent === i18n.t('family.ai.modelId'));
  return label === undefined ? null : document.getElementById(label.htmlFor) as HTMLInputElement;
};

/** True when the key is in no input value, no text, no attribute and no storage. */
const keyIsNowhere = (): boolean =>
  !document.body.innerHTML.includes(KEY) &&
  [...document.querySelectorAll('input')].every((input) => input.value !== KEY) &&
  !JSON.stringify({ ...localStorage }).includes(KEY) &&
  !JSON.stringify({ ...sessionStorage }).includes(KEY);

describe('the AI assistant card', () => {
  it('shows the free reads left and an Add key button when the family has no key', async () => {
    const page = await render(<FamilyPage />, withAi({ free: FREE }));
    await until(() => cardText(page).includes('Using free AI · 4 of 5 left today'));
    expect(card(page).querySelector('h2')?.textContent).toBe(i18n.t('family.ai.title'));
    expect(cardButton(page, i18n.t('family.ai.add'))).toBeDefined();
    expect(cardButton(page, i18n.t('family.ai.replace'))).toBeUndefined();
  });

  it('shows the key hint, who added it and when, with Replace, Remove and the model choice', async () => {
    const page = await render(<FamilyPage />, withAi(withKey()));
    await until(() => cardText(page).includes('Key …a3f2 · added by Sam'));
    const date = formatDate(UPDATED, { day: 'numeric', month: 'short' });
    expect(cardText(page)).toContain(i18n.t('family.ai.keyLine', { hint: 'a3f2', name: 'Sam', date }));
    expect(cardButton(page, i18n.t('family.ai.replace'))).toBeDefined();
    expect(cardButton(page, i18n.t('family.ai.remove'))).toBeDefined();
    expect(cardButton(page, i18n.t('family.ai.add'))).toBeUndefined();
    const choice = card(page).querySelector(`[role="radiogroup"][aria-label="${i18n.t('family.ai.model')}"]`);
    expect([...(choice?.querySelectorAll('label') ?? [])].map((label) => label.textContent)).toEqual([
      i18n.t('family.ai.modelFree'),
      i18n.t('family.ai.modelChosen'),
    ]);
    expect(cardText(page)).not.toContain('left today');
  });

  it('says a former member added the key when the member has left', async () => {
    const page = await render(<FamilyPage />, withAi(withKey({ setByName: undefined })));
    await until(() => cardText(page).includes('added by a former member'));
  });

  it('says in demo mode that AI needs a signed-in family', async () => {
    const page = await render(<FamilyPage />, demo());
    expect(cardText(page)).toContain(i18n.t('family.ai.demo'));
    expect(card(page).querySelector('button')).toBeNull();
  });
});

describe('saving the family key', () => {
  it('sends the key, empties the field before the answer, and shows the key nowhere afterwards', async () => {
    let current: AiStatus = { free: FREE };
    const answer = pending();
    const fetch = stubFetch({ '/api/ai/key': answer.reply });
    const page = await render(<FamilyPage />, withAi(current, [], { status: async () => current }));
    await click(cardButton(page, i18n.t('family.ai.add')));

    expect(openSheet()?.textContent).toContain(i18n.t('family.ai.keySheet.title'));
    // The words are the link itself, not an empty link beside them.
    expect(openSheet()?.querySelector('a[href="https://openrouter.ai/keys"]')?.textContent).toBe('Get a key at openrouter.ai/keys');
    expect(openSheet()?.textContent).toContain(i18n.t('family.ai.keySheet.limit'));
    expect(keyField().type).toBe('password');
    expect(keyField().autocomplete).toBe('off');
    expect(sheetButton(i18n.t('family.ai.keySheet.save'))?.disabled).toBe(true);
    await act(async () => typeInto(keyField(), KEY));
    expect(keyField().value).toBe(KEY);
    expect(sheetButton(i18n.t('family.ai.keySheet.save'))?.disabled).toBe(false);

    await click(sheetButton(i18n.t('family.ai.keySheet.save')));
    // The request is still unanswered: the field and the page already forget the key.
    await until(() => fetch.mock.calls.length === 1);
    expect(keyField().value).toBe('');
    // Nothing more can be typed while the key is being checked.
    expect(keyField().disabled).toBe(true);
    expect(keyIsNowhere()).toBe(true);
    expect(openSheet()?.textContent).toContain(i18n.t('family.ai.keySheet.saving'));

    current = withKey();
    await act(async () => answer.answer({ body: { saved: true } }));
    await until(() => openSheet() === null);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/key');
    expect(JSON.parse(init.body as string)).toEqual({ key: KEY });
    await until(() => cardText(page).includes('Key …a3f2'));
    expect(keyIsNowhere()).toBe(true);
    expect(page.textContent).not.toContain(KEY);
  });

  it('empties the key itself once it is saved, without waiting for the dialog to close', async () => {
    let current: AiStatus = { free: FREE };
    const answer = pending();
    const fetch = stubFetch({ '/api/ai/key': answer.reply });
    const page = await render(<FamilyPage />, withAi(current, [], { status: async () => current }));
    await click(cardButton(page, i18n.t('family.ai.add')));
    await act(async () => typeInto(keyField(), KEY));
    await click(sheetButton(i18n.t('family.ai.keySheet.save')));
    await until(() => fetch.mock.calls.length === 1);

    // The field is disabled, so this cannot happen from the keyboard; if text reached the state anyway, success must not keep it.
    const late = 'sk-or-v1-typed-while-checking';
    await act(async () => typeInto(keyField(), late));
    current = withKey();
    await act(async () => answer.answer({ body: { saved: true } }));
    await until(() => openSheet() === null);
    await until(() => cardButton(page, i18n.t('family.ai.replace')) !== undefined);

    await click(cardButton(page, i18n.t('family.ai.replace')));
    expect(keyField().disabled).toBe(false);
    expect(keyField().value).toBe('');
    expect(document.body.innerHTML).not.toContain(late);
  });

  it('says why OpenRouter refused the key, empties the field and keeps the sheet open', async () => {
    stubFetch({ '/api/ai/key': { body: { error: 'key-invalid' }, status: 422 } });
    const page = await render(<FamilyPage />, withAi({ free: FREE }));
    await click(cardButton(page, i18n.t('family.ai.add')));
    await act(async () => typeInto(keyField(), KEY));
    await click(sheetButton(i18n.t('family.ai.keySheet.save')));

    await until(() => (openSheet()?.textContent ?? '').includes(i18n.t('ai.error.keyRejected')));
    expect(openSheet()?.querySelector('[role="alert"]')?.textContent).toBe(i18n.t('ai.error.keyRejected'));
    expect(keyField().value).toBe('');
    expect(sheetButton(i18n.t('family.ai.keySheet.save'))?.disabled).toBe(true);
    expect(keyIsNowhere()).toBe(true);
    expect(page.textContent).not.toContain(KEY);
  });

  it('says to sign in again, and lets the member try again, when the token cannot be read', async () => {
    const fetch = stubFetch({});
    const page = await render(
      <FamilyPage />,
      withAi({ free: FREE }, [], {
        token: async () => {
          throw new Error('session store unavailable');
        },
      }),
    );
    await click(cardButton(page, i18n.t('family.ai.add')));
    await act(async () => typeInto(keyField(), KEY));
    await click(sheetButton(i18n.t('family.ai.keySheet.save')));

    // The client answers a token that cannot be had as unauthorized (src/ai/client.ts).
    await until(() => (openSheet()?.textContent ?? '').includes(i18n.t('ai.error.unauthorized')));
    expect(fetch).not.toHaveBeenCalled();
    expect(openSheet()?.textContent).not.toContain('unavailable');
    expect(sheetButton(i18n.t('family.ai.keySheet.cancel'))?.disabled).toBe(false);
    expect(keyIsNowhere()).toBe(true);
  });

  it('forgets a typed key when the sheet is cancelled, and Replace opens the same sheet', async () => {
    const page = await render(<FamilyPage />, withAi(withKey()));
    await until(() => cardButton(page, i18n.t('family.ai.replace')) !== undefined);
    await click(cardButton(page, i18n.t('family.ai.replace')));
    expect(openSheet()?.textContent).toContain(i18n.t('family.ai.keySheet.title'));
    await act(async () => typeInto(keyField(), KEY));
    await click(sheetButton(i18n.t('family.ai.keySheet.cancel')));
    expect(openSheet()).toBeNull();

    await click(cardButton(page, i18n.t('family.ai.replace')));
    expect(keyField().value).toBe('');
    expect(keyIsNowhere()).toBe(true);
  });
});

describe('removing the family key', () => {
  it('asks first, then clears the key and goes back to the free reads', async () => {
    const calls: string[] = [];
    let current = withKey();
    const page = await render(
      <FamilyPage />,
      withAi(current, calls, {
        status: async () => current,
        clearKey: async () => {
          calls.push('clear');
          current = { free: FREE };
        },
      }),
    );
    await until(() => cardButton(page, i18n.t('family.ai.remove')) !== undefined);

    await click(cardButton(page, i18n.t('family.ai.remove')));
    expect(openSheet()?.textContent).toContain(i18n.t('family.ai.removeSheet.title'));
    expect(openSheet()?.textContent).toContain(i18n.t('family.ai.removeSheet.body'));
    expect(calls).toEqual([]);

    await click(sheetButton(i18n.t('family.ai.remove')));
    await until(() => openSheet() === null);
    expect(calls).toEqual(['clear']);
    await until(() => cardText(page).includes('Using free AI · 4 of 5 left today'));
  });

  it('keeps the key when you choose Keep it', async () => {
    const calls: string[] = [];
    const page = await render(<FamilyPage />, withAi(withKey(), calls));
    await until(() => cardButton(page, i18n.t('family.ai.remove')) !== undefined);
    await click(cardButton(page, i18n.t('family.ai.remove')));
    await click(sheetButton(i18n.t('family.ai.removeSheet.keep')));
    expect(openSheet()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('says it did not work, without the server’s words, when removing fails', async () => {
    const page = await render(
      <FamilyPage />,
      withAi(withKey(), [], {
        clearKey: async () => {
          throw new Error('duplicate key value violates constraint family_ai_keys_pkey');
        },
      }),
    );
    await until(() => cardButton(page, i18n.t('family.ai.remove')) !== undefined);
    await click(cardButton(page, i18n.t('family.ai.remove')));
    await click(sheetButton(i18n.t('family.ai.remove')));

    await until(() => (openSheet()?.textContent ?? '').includes(i18n.t('family.ai.failed')));
    expect(page.textContent).not.toContain('constraint');
    expect(sheetButton(i18n.t('family.ai.remove'))?.disabled).toBe(false);
  });
});

describe('choosing the model', () => {
  it('refuses a model id the server would refuse, and records nothing', async () => {
    const calls: string[] = [];
    const page = await render(<FamilyPage />, withAi(withKey(), calls));
    await until(() => cardButton(page, i18n.t('family.ai.saveModel')) !== undefined);
    await chooseModel(page, 'chosen');
    const save = cardButton(page, i18n.t('family.ai.saveModel'))!;
    expect(save.disabled).toBe(true);

    for (const bad of ['openai/gpt-4o:online', 'openrouter/auto', 'Google/Gemini-2.5-Flash', 'gemini-2.5-flash', `a/${'b'.repeat(100)}`]) {
      await act(async () => typeInto(modelField(page)!, bad));
      expect(cardText(page)).toContain(i18n.t('family.ai.modelInvalid'));
      expect(modelField(page)!.getAttribute('aria-invalid')).toBe('true');
      expect(save.disabled).toBe(true);
      await click(save);
    }
    expect(calls).toEqual([]);
  });

  it('saves a typed OpenRouter model id', async () => {
    const calls: string[] = [];
    const page = await render(<FamilyPage />, withAi(withKey(), calls));
    await until(() => cardButton(page, i18n.t('family.ai.saveModel')) !== undefined);
    await chooseModel(page, 'chosen');
    expect(modelField(page)!.dir).toBe('ltr');
    expect(card(page).querySelector('a[href^="https://openrouter.ai/models"]')?.textContent).toBe('Models that support structured outputs');

    await act(async () => typeInto(modelField(page)!, 'google/gemini-2.5-flash'));
    expect(cardText(page)).not.toContain(i18n.t('family.ai.modelInvalid'));
    await click(cardButton(page, i18n.t('family.ai.saveModel')));
    await until(() => calls.length > 0);
    expect(calls).toEqual(['model:google/gemini-2.5-flash']);
  });

  it('starts on the chosen model, and goes back to the free models with null', async () => {
    const calls: string[] = [];
    const page = await render(<FamilyPage />, withAi(withKey({ model: 'meta-llama/llama-3.3-70b-instruct:free' }), calls));
    await until(() => modelField(page) !== null);
    expect(modelField(page)!.value).toBe('meta-llama/llama-3.3-70b-instruct:free');

    await chooseModel(page, 'free');
    expect(modelField(page)).toBeNull();
    await click(cardButton(page, i18n.t('family.ai.saveModel')));
    await until(() => calls.length > 0);
    expect(calls).toEqual(['model:null']);
  });

  it('says it did not work, without the server’s words, when saving the model fails', async () => {
    const page = await render(
      <FamilyPage />,
      withAi(withKey(), [], {
        setModel: async () => {
          throw new Error('new row for relation "family_ai_keys" violates check constraint');
        },
      }),
    );
    await until(() => cardButton(page, i18n.t('family.ai.saveModel')) !== undefined);
    await click(cardButton(page, i18n.t('family.ai.saveModel')));
    await until(() => cardText(page).includes(i18n.t('family.ai.failed')));
    expect(page.textContent).not.toContain('violates');
  });
});

describe('when the status is not known', () => {
  const noStatusYet = (): Promise<AiStatus> => new Promise<AiStatus>(() => {});

  it('shows no Add button, or anything to press, while the status is loading', async () => {
    const page = await render(<FamilyPage />, withAi(withKey(), [], { status: noStatusYet }));
    expect(card(page).querySelector('h2')?.textContent).toBe(i18n.t('family.ai.title'));
    expect(cardText(page)).toContain(i18n.t('common.loading'));
    expect(card(page).querySelector('button')).toBeNull();
    expect(cardText(page)).not.toContain('left today');
  });

  it('says it could not tell, with Retry and no Add, then shows the right layout after Retry', async () => {
    let down = true;
    const page = await render(
      <FamilyPage />,
      withAi(withKey(), [], {
        status: async () => {
          if (down) throw new Error('rpc failed: permission denied for family_ai_keys');
          return withKey();
        },
      }),
    );
    await until(() => cardText(page).includes(i18n.t('family.ai.failed')));
    expect(cardButton(page, i18n.t('family.ai.retry'))).toBeDefined();
    expect(cardButton(page, i18n.t('family.ai.add'))).toBeUndefined();
    expect(cardButton(page, i18n.t('family.ai.remove'))).toBeUndefined();
    expect(cardText(page)).not.toContain('permission denied');

    down = false;
    await click(cardButton(page, i18n.t('family.ai.retry')));
    await until(() => cardButton(page, i18n.t('family.ai.remove')) !== undefined);
    expect(cardText(page)).toContain('Key …a3f2');
    expect(cardText(page)).not.toContain(i18n.t('family.ai.failed'));
    expect(cardButton(page, i18n.t('family.ai.add'))).toBeUndefined();
  });

  it('shows loading, not Retry, while Retry waits, and Add only once a family without a key is confirmed', async () => {
    let answer: (status: AiStatus) => void = () => {};
    let attempt = 0;
    const page = await render(
      <FamilyPage />,
      withAi({ free: FREE }, [], {
        status: () => {
          attempt += 1;
          if (attempt === 1) return Promise.reject(new Error('offline'));
          return new Promise<AiStatus>((resolve) => {
            answer = resolve;
          });
        },
      }),
    );
    await until(() => cardButton(page, i18n.t('family.ai.retry')) !== undefined);
    await click(cardButton(page, i18n.t('family.ai.retry')));
    expect(cardText(page)).toContain(i18n.t('common.loading'));
    expect(card(page).querySelector('button')).toBeNull();

    await act(async () => answer({ free: FREE }));
    await until(() => cardButton(page, i18n.t('family.ai.add')) !== undefined);
    expect(cardText(page)).toContain('Using free AI · 4 of 5 left today');
  });

  /** Runs `doIt` once the card is showing `first`, with every later status() failing, and expects the failed layout. */
  async function failsAfter(first: AiStatus, ready: (page: HTMLElement) => boolean, doIt: (page: HTMLElement) => Promise<void>): Promise<HTMLElement> {
    let down = false;
    const page = await render(
      <FamilyPage />,
      withAi(first, [], {
        status: async () => {
          if (down) throw new Error('offline');
          return first;
        },
      }),
    );
    await until(() => ready(page));
    down = true;
    await doIt(page);
    await until(() => cardButton(page, i18n.t('family.ai.retry')) !== undefined);
    expect(cardText(page)).toContain(i18n.t('family.ai.failed'));
    expect(cardButton(page, i18n.t('family.ai.add'))).toBeUndefined();
    expect(cardButton(page, i18n.t('family.ai.remove'))).toBeUndefined();
    return page;
  }

  it('does not fall back to the no-key layout when the refresh after saving a key fails', async () => {
    stubFetch({ '/api/ai/key': { body: { saved: true } } });
    await failsAfter(
      { free: FREE },
      (page) => cardButton(page, i18n.t('family.ai.add')) !== undefined,
      async (page) => {
        await click(cardButton(page, i18n.t('family.ai.add')));
        await act(async () => typeInto(keyField(), KEY));
        await click(sheetButton(i18n.t('family.ai.keySheet.save')));
        await until(() => openSheet() === null);
      },
    );
  });

  it('does not fall back to the no-key layout when the refresh after removing the key fails', async () => {
    await failsAfter(
      withKey(),
      (page) => cardButton(page, i18n.t('family.ai.remove')) !== undefined,
      async (page) => {
        await click(cardButton(page, i18n.t('family.ai.remove')));
        await click(sheetButton(i18n.t('family.ai.remove')));
        await until(() => openSheet() === null);
      },
    );
  });

  it('does not fall back to the no-key layout when the refresh after saving the model fails', async () => {
    await failsAfter(
      withKey(),
      (page) => cardButton(page, i18n.t('family.ai.saveModel')) !== undefined,
      (page) => click(cardButton(page, i18n.t('family.ai.saveModel'))),
    );
  });
});
