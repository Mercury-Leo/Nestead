// Test-only: shared by the *.test.ts files in this folder. Nothing else may import it.
import { afterEach, beforeEach, vi } from 'vitest';
import { createAiHandler } from '.';
import type { AiOptions, AiStore, ClaimResult } from '.';

export const TOKEN = 'eyJmember.token.sig';
export const SHARED = 'sk-or-v1-shared000000000000000000000000';
export const FAMILY_KEY = 'sk-or-v1-family000000000000000000000000';
export const FAMILY = '11111111-1111-4111-8111-111111111111';
export const SECRET = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));
export const FREE = 'a/one:free,b/two:free,openai/gpt-4o';
export const PAGE = 'https://example.com/soup';

export const goodAnswer = { found: true, title: 'Lentil soup', description: null, servings: 4, servingUnit: null, prepMin: 10, cookMin: 30, ingredients: ['1 cup lentils'], steps: ['Simmer in a large pot.'] };
export const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export const completion = (content: unknown) => reply({ model: 'a/one:free', choices: [{ finish_reason: 'stop', message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] });

/** Makes any fetch a test did not inject throw, so a test cannot reach the real network. Call once at the top of a test file. */
export function blockRealNetwork(): void {
  beforeEach(() => {
    vi.stubGlobal('fetch', () => {
      throw new Error('A test reached the real network');
    });
  });
  afterEach(() => vi.unstubAllGlobals());
}

/**
 * A fetch that throws Illegal invocation if called as a method (this !== undefined && this !== globalThis),
 * as the browser's and Workers' fetch do. It works only when called unbound: const doFetch = fetch; doFetch(...).
 */
export function strictFetch(answer: () => Response): typeof fetch {
  return function (this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(answer());
  } as unknown as typeof fetch;
}

export interface Network {
  fetch: typeof globalThis.fetch;
  calls: { url: string; init?: RequestInit }[];
}

/** A fetch that answers OpenRouter and the test page, and records every call. */
export function network(routes: { chat?: (init?: RequestInit) => Response | Promise<Response>; key?: () => Response; page?: () => Response } = {}): Network {
  const calls: Network['calls'] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === 'https://openrouter.ai/api/v1/chat/completions') return (routes.chat ?? (() => completion(goodAnswer)))(init);
    if (url === 'https://openrouter.ai/api/v1/key') return (routes.key ?? (() => reply({ data: { limit_remaining: null, is_management_key: false, is_provisioning_key: false } })))();
    if (url.startsWith(PAGE)) return (routes.page ?? (() => new Response('<html><head><meta property="og:image" content="/soup.jpg"></head><body><p>1 cup lentils. Simmer.</p></body></html>', { status: 200 })))();
    throw new Error(`unexpected fetch ${url}`);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

export function fakeStore(claim: ClaimResult | 'unauthorized', familyId: string | null | 'unauthorized' = FAMILY) {
  const stored: { ciphertext: string; hint: string }[] = [];
  const store: AiStore = {
    claim: vi.fn(async () => claim),
    familyId: vi.fn(async () => familyId),
    storeKey: vi.fn(async (ciphertext: string, hint: string) => {
      stored.push({ ciphertext, hint });
      return undefined;
    }),
  };
  return { store, stored };
}

/** The handler on a fake store and network, with `warn` silenced so the test output stays clean. */
export function handler(store: AiStore, net = network(), extra: Partial<AiOptions> = {}) {
  const log = vi.fn();
  const handle = createAiHandler({ openRouterKey: SHARED, freeModels: FREE, keySecret: SECRET, fetch: net.fetch, store: () => store, log, warn: () => undefined, resolveHost: async () => ['93.184.216.34'], ...extra });
  return { handle, log, net };
}

export const post = (path: string, body: unknown, token: string | null = TOKEN): Request =>
  new Request(`http://localhost/api/ai/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const chatCall = (net: Network) => net.calls.find((call) => call.url.endsWith('/chat/completions'))!;
export const sentBody = (net: Network) => JSON.parse(chatCall(net).init!.body as string) as Record<string, unknown>;
export const sentAuth = (net: Network) => (chatCall(net).init!.headers as Record<string, string>).authorization;
/** The user message of the one chat request: the delimited text the model reads. */
export const sentUser = (net: Network) => (sentBody(net).messages as { role: string; content: string }[])[1]!.content;
