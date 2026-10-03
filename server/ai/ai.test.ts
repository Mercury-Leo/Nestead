// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAiHandler, MAX_TEXT } from '.';
import type { AiStore, ClaimResult } from '.';
import { decryptKey, encryptKey, importSecret } from './crypto';
import { detectEquipment } from '../import';
import { FAMILY, FAMILY_KEY, FREE, PAGE, SECRET, SHARED, TOKEN, blockRealNetwork, completion, fakeStore, goodAnswer, handler, network, post, reply, sentAuth, sentBody, sentUser, strictFetch } from './testing';

blockRealNetwork();

async function familyClaim(model: string | null = null): Promise<ClaimResult> {
  const secret = await importSecret(SECRET);
  return { mode: 'family', familyId: FAMILY, ciphertext: await encryptKey(FAMILY_KEY, FAMILY, secret!), model };
}

const PAGE_HTML = '<html><head><meta property="og:image" content="/soup.jpg"></head><body><p>1 cup lentils. Simmer.</p></body></html>';

/** A request with exactly this Authorization header, or none. */
const withAuthorization = (value: string | null): Request =>
  new Request('http://localhost/api/ai/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(value === null ? {} : { authorization: value }) },
    body: JSON.stringify({ text: 'Soup' }),
  });

describe('POST /api/ai/extract, pasted text', () => {
  it('reads it on the free tier and answers the import shape', async () => {
    const { handle, net } = handler(fakeStore({ mode: 'free' }).store);
    const response = await handle(post('extract', { text: '1 cup lentils. Simmer.' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { recipe: Record<string, unknown>; report: { missing: string[] } };
    expect(body.recipe).toMatchObject({ title: 'Lentil soup', servings: 4, ingredients: ['1 cup lentils'] });
    expect(body.recipe.equipment).toEqual(detectEquipment(['Simmer in a large pot.'])); // ours, not the model's
    expect(body.recipe.url).toBeUndefined();
    expect(body.recipe.image).toBeUndefined();
    expect(body.report.missing).toEqual(['photo', 'calories']);
    expect(sentAuth(net)).toBe(`Bearer ${SHARED}`);
    expect(sentBody(net)).toMatchObject({ model: 'a/one:free', models: ['a/one:free', 'b/two:free'] });
  });

  it('builds the request from constants and the text only: no secrets, no tools', async () => {
    const { handle, net } = handler(fakeStore({ mode: 'free' }).store);
    await handle(post('extract', { text: 'Soup' }));
    const raw = net.calls.find((call) => call.url.endsWith('/chat/completions'))!.init!.body as string;
    for (const secret of [TOKEN, SHARED, FAMILY, SECRET]) expect(raw).not.toContain(secret);
    const body = sentBody(net);
    for (const field of ['tools', 'tool_choice', 'plugins', 'user']) expect(body).not.toHaveProperty(field);
    expect(sentUser(net)).toMatch(/^<<<RECIPE [0-9a-f]{32}>>>\nSoup\n<<<END [0-9a-f]{32}>>>$/);
  });

  it('uses a new nonce for every read', async () => {
    const nonces = new Set<string>();
    for (let read = 0; read < 3; read += 1) {
      const { handle, net } = handler(fakeStore({ mode: 'free' }).store);
      await handle(post('extract', { text: 'Soup' }));
      nonces.add(/^<<<RECIPE ([0-9a-f]{32})>>>/.exec(sentUser(net))![1]!);
    }
    expect(nonces.size).toBe(3);
  });

  it('uses the family key, decrypted for the call, and counts nothing', async () => {
    const { handle, net } = handler(fakeStore(await familyClaim()).store);
    expect((await handle(post('extract', { text: 'Soup' }))).status).toBe(200);
    expect(sentAuth(net)).toBe(`Bearer ${FAMILY_KEY}`);
    expect(sentBody(net)).toMatchObject({ models: ['a/one:free', 'b/two:free'] });
  });

  it('sends a model the family chose alone', async () => {
    const { handle, net } = handler(fakeStore(await familyClaim('google/gemini-2.5-flash')).store);
    await handle(post('extract', { text: 'Soup' }));
    expect(sentBody(net).model).toBe('google/gemini-2.5-flash');
    expect(sentBody(net)).not.toHaveProperty('models');
  });

  it('refuses a chosen model that is not a plain model id, before any call', async () => {
    const { handle, net } = handler(fakeStore(await familyClaim('openai/gpt-4o:online')).store);
    const response = await handle(post('extract', { text: 'Soup' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'model-failed' });
    expect(net.calls).toHaveLength(0);
  });

  it('answers key-invalid when the stored key will not decrypt', async () => {
    const claim = await familyClaim();
    const { handle, net } = handler(fakeStore({ ...claim, familyId: '22222222-2222-4222-8222-222222222222' } as ClaimResult).store);
    const response = await handle(post('extract', { text: 'Soup' }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'key-invalid' });
    expect(net.calls).toHaveLength(0);
  });

  it('accepts exactly MAX_TEXT characters, counted after trimming', async () => {
    const { handle } = handler(fakeStore({ mode: 'free' }).store);
    expect((await handle(post('extract', { text: `  ${'x'.repeat(MAX_TEXT)}\n` }))).status).toBe(200);
  });

  it('calls the global fetch unbound when none is injected, as Workers require', async () => {
    vi.stubGlobal('fetch', strictFetch(() => completion(goodAnswer)));
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network(), { fetch: undefined });
    expect((await handle(post('extract', { text: 'Soup' }))).status).toBe(200);
  });

  it('hands the token to the store, which is what Supabase checks', async () => {
    const jwtLike = 'aB3-_.~+/=';
    const { store } = fakeStore({ mode: 'free' });
    const storeFor = vi.fn(() => store);
    const { handle } = handler(store, network(), { store: storeFor });
    expect((await handle(post('extract', { text: 'Soup' }, jwtLike))).status).toBe(200);
    expect(storeFor).toHaveBeenCalledWith(jwtLike);
  });

  it('builds the PostgREST store from the Supabase options when none is given', async () => {
    const net = network();
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith('https://proj.supabase.co/')) return net.fetch(input, init);
      seen.push({ url, headers: init!.headers as Record<string, string> });
      return reply({ mode: 'free' });
    }) as unknown as typeof globalThis.fetch;
    const { handle } = handler(fakeStore('unauthorized').store, net, { store: undefined, fetch, supabaseUrl: 'https://proj.supabase.co', supabaseKey: 'sb_publishable_x' });
    expect((await handle(post('extract', { text: 'Soup' }))).status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('https://proj.supabase.co/rest/v1/rpc/claim_ai_request');
    expect(seen[0]!.headers).toMatchObject({ apikey: 'sb_publishable_x', authorization: `Bearer ${TOKEN}` });
  });
});

describe('POST /api/ai/extract, the checks before any work', () => {
  it('answers quota-exceeded with its scope and calls nothing', async () => {
    for (const scope of ['user', 'app'] as const) {
      const { handle, net } = handler(fakeStore({ mode: 'quota-exceeded', scope }).store);
      const response = await handle(post('extract', { text: 'Soup' }));
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: 'quota-exceeded', scope });
      expect(net.calls).toHaveLength(0);
    }
  });

  it('answers unauthorized without a token, and neither asks the store nor calls out', async () => {
    const { store } = fakeStore({ mode: 'free' });
    const { handle, net } = handler(store);
    const response = await handle(post('extract', { text: 'Soup' }, null));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(store.claim).not.toHaveBeenCalled();
    expect(net.calls).toHaveLength(0);
  });

  it('answers unauthorized for an Authorization header that is not a plain bearer token', async () => {
    const { store } = fakeStore({ mode: 'free' });
    const { handle, net } = handler(store);
    for (const value of ['Bearer abc\u00e9', 'Bearer a b', 'Bearer', 'Bearer a"b', 'Bearer a,b', 'Basic abc', 'abc']) {
      const response = await handle(withAuthorization(value));
      expect(response.status, value).toBe(401);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    }
    expect(store.claim).not.toHaveBeenCalled();
    expect(net.calls).toHaveLength(0);
  });

  it('accepts the scheme in any case', async () => {
    const { handle } = handler(fakeStore({ mode: 'free' }).store);
    expect((await handle(withAuthorization('bearer abc.def'))).status).toBe(200);
  });

  it('answers unauthorized when Supabase refuses the token', async () => {
    const { handle, net } = handler(fakeStore('unauthorized').store);
    expect((await handle(post('extract', { text: 'Soup' }))).status).toBe(401);
    expect(net.calls).toHaveLength(0);
  });

  it('answers unauthorized for a member in no family', async () => {
    const { handle, net } = handler(fakeStore({ mode: 'no-family' }).store);
    const response = await handle(post('extract', { text: 'Soup' }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(net.calls).toHaveLength(0);
  });

  it('checks the input before it asks the store', async () => {
    const cases: [string, unknown, number, string][] = [
      ['no field', {}, 400, 'invalid-input'],
      ['a text that is not a string', { text: 1 }, 400, 'invalid-input'],
      ['a url that is not a string', { url: 1 }, 400, 'invalid-input'],
      ['both fields', { text: 'a', url: PAGE }, 400, 'invalid-input'],
      ['a body that is not JSON', 'not json', 400, 'invalid-input'],
      ['a body that is an array', [], 400, 'invalid-input'],
      ['a blank text', { text: '   ' }, 400, 'invalid-input'],
      ['a blank url', { url: '  ' }, 400, 'invalid-url'],
      ['a text over the limit', { text: 'x'.repeat(MAX_TEXT + 1) }, 413, 'too-large'],
      ['a body over 128 KB', 'x'.repeat(129 * 1024), 413, 'too-large'],
      ['a body over 128 KB in bytes', JSON.stringify({ text: '\u00e9'.repeat(70 * 1024) }), 413, 'too-large'],
    ];
    for (const [name, body, status, error] of cases) {
      const { store } = fakeStore({ mode: 'free' });
      const { handle, net } = handler(store);
      const response = await handle(post('extract', body));
      expect(response.status, name).toBe(status);
      expect(await response.json(), name).toEqual({ error });
      expect(store.claim, name).not.toHaveBeenCalled();
      expect(net.calls, name).toHaveLength(0);
    }
  });

  it('refuses a body whose Content-Length is over 128 KB without reading it', async () => {
    const { store } = fakeStore({ mode: 'free' });
    const { handle } = handler(store);
    const request = new Request('http://localhost/api/ai/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'content-length': String(129 * 1024) },
      body: JSON.stringify({ text: 'Soup' }),
    });
    const text = vi.spyOn(request, 'text');
    expect((await handle(request)).status).toBe(413);
    expect(text).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/extract, configuration', () => {
  it('is unavailable on the free path without the shared key, or without a usable free model', async () => {
    for (const extra of [{ openRouterKey: undefined }, { openRouterKey: '  ' }, { freeModels: 'openai/gpt-4o' }, { freeModels: undefined }]) {
      const { handle, net } = handler(fakeStore({ mode: 'free' }).store, network(), extra);
      const response = await handle(post('extract', { text: 'Soup' }));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'unavailable' });
      expect(net.calls).toHaveLength(0);
    }
  });

  it('is unavailable on the family path without a usable AI_KEY_SECRET', async () => {
    for (const keySecret of [undefined, '', 'not base64!', btoa('short')]) {
      const { handle, net } = handler(fakeStore(await familyClaim()).store, network(), { keySecret });
      expect((await handle(post('extract', { text: 'Soup' }))).status).toBe(503);
      expect(net.calls).toHaveLength(0);
    }
  });

  it('is unavailable with no store and no Supabase settings', async () => {
    for (const extra of [{ store: undefined }, { store: undefined, supabaseUrl: 'https://proj.supabase.co' }, { store: undefined, supabaseKey: 'sb_publishable_x' }]) {
      const { handle, net } = handler(fakeStore({ mode: 'free' }).store, network(), extra);
      expect((await handle(post('extract', { text: 'Soup' }))).status).toBe(503);
      expect(net.calls).toHaveLength(0);
    }
  });

  it('answers unavailable, and logs no detail, when the store throws', async () => {
    const store: AiStore = { claim: vi.fn(async () => { throw new Error(`boom ${TOKEN}`); }), familyId: vi.fn(), storeKey: vi.fn() };
    const { handle, log } = handler(store);
    const response = await handle(post('extract', { text: 'Soup' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'unavailable' });
    expect(log.mock.calls).toEqual([[{ route: 'extract', error: 'unavailable' }]]);
  });

  it('warns once, at construction, about the free models it drops', async () => {
    const warn = vi.fn();
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network(), { warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('openai/gpt-4o');
    await handle(post('extract', { text: 'Soup' }));
    await handle(post('extract', { text: 'Soup' }));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('names every dropped entry in the one warning, and none that it keeps', () => {
    const warn = vi.fn();
    createAiHandler({ freeModels: ' a/one:free, openai/gpt-4o:online,,bad id ,b/two:free,~x/y:free,c/three:free,d/four:free', warn });
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]![0] as string;
    for (const dropped of ['openai/gpt-4o:online', 'bad id', '~x/y:free']) expect(message).toContain(dropped);
    for (const kept of ['a/one:free', 'b/two:free', 'c/three:free', 'd/four:free']) expect(message).not.toContain(kept);
  });

  it('does not warn when every entry is valid, or when none is set', () => {
    const warn = vi.fn();
    createAiHandler({ freeModels: 'a/one:free,b/two:free,c/three:free,d/four:free', warn });
    createAiHandler({ freeModels: '', warn });
    createAiHandler({ freeModels: ' , ', warn });
    createAiHandler({ warn });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on console.warn by default', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      createAiHandler({ freeModels: FREE });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]![0])).toContain('openai/gpt-4o');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('POST /api/ai/extract, what OpenRouter answers', () => {
  const free: [number, number, Record<string, unknown>][] = [
    [401, 503, { error: 'unavailable' }],
    [402, 503, { error: 'unavailable' }],
    [429, 429, { error: 'quota-exceeded', scope: 'app' }],
    [408, 504, { error: 'timeout' }],
    [500, 502, { error: 'model-failed' }],
  ];
  const family: [number, number, Record<string, unknown>][] = [
    [401, 422, { error: 'key-invalid' }],
    [402, 402, { error: 'key-out-of-credit' }],
    [429, 502, { error: 'model-failed' }],
    [408, 504, { error: 'timeout' }],
    [500, 502, { error: 'model-failed' }],
  ];

  for (const [upstream, status, body] of free) {
    it(`maps ${upstream} on the free tier to ${status}`, async () => {
      const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ chat: () => reply({}, upstream) }));
      const response = await handle(post('extract', { text: 'Soup' }));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
    });
  }

  for (const [upstream, status, body] of family) {
    it(`maps ${upstream} on the family key to ${status}`, async () => {
      const { handle } = handler(fakeStore(await familyClaim()).store, network({ chat: () => reply({}, upstream) }));
      const response = await handle(post('extract', { text: 'Soup' }));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
    });
  }

  it('answers timeout when the model call outlasts its limit', async () => {
    const hang = (init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ chat: hang }), { timeouts: { model: 10 } });
    const response = await handle(post('extract', { text: 'Soup' }));
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'timeout' });
  });

  it('answers model-failed when OpenRouter cannot be reached', async () => {
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ chat: () => { throw new TypeError('network'); } }));
    expect((await handle(post('extract', { text: 'Soup' }))).status).toBe(502);
  });

  it('answers model-failed for output that breaks the schema, and not-a-recipe for found: false', async () => {
    const bad = ['not json', { ...goodAnswer, image: 'x' }, '```json {}```', { ...goodAnswer, steps: 'Simmer.' }];
    for (const content of bad) {
      const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ chat: () => completion(content) }));
      const response = await handle(post('extract', { text: 'Soup' }));
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'model-failed' });
    }
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ chat: () => completion({ ...goodAnswer, found: false }) }));
    const response = await handle(post('extract', { text: 'Soup' }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'not-a-recipe' });
  });
});

describe('POST /api/ai/extract, logs and answers', () => {
  it('logs the route and model of a read, and nothing from the request', async () => {
    const { handle, log } = handler(fakeStore({ mode: 'free' }).store);
    await handle(post('extract', { text: 'Soup' }));
    expect(log.mock.calls).toEqual([[{ route: 'extract', model: 'a/one:free' }]]);
  });

  it('logs no key, token, secret or text when a key is refused', async () => {
    const echo = () => reply({ error: { message: `Invalid ${FAMILY_KEY} ${SHARED} ${TOKEN} ${SECRET} Soup` } }, 401);
    const { handle, log } = handler(fakeStore(await familyClaim()).store, network({ chat: echo }));
    expect((await handle(post('extract', { text: 'Soup' }))).status).toBe(422);
    expect(log.mock.calls).toEqual([[{ route: 'extract', error: 'key-invalid', status: 401 }]]);
    for (const [entry] of log.mock.calls) {
      for (const secret of [TOKEN, FAMILY_KEY, SHARED, SECRET, 'Soup']) expect(JSON.stringify(entry)).not.toContain(secret);
    }
  });

  it('puts no key, token or secret in any answer, whatever OpenRouter says', async () => {
    const family = await familyClaim();
    const echo = (status: number) => () => reply({ error: { message: `rejected ${FAMILY_KEY} ${SHARED} ${TOKEN} ${SECRET}` } }, status);
    const runs: Promise<Response>[] = [];
    for (const status of [200, 401, 402, 408, 429, 500]) {
      runs.push(handler(fakeStore({ mode: 'free' }).store, network({ chat: echo(status), key: echo(status) })).handle(post('extract', { text: 'Soup' })));
      runs.push(handler(fakeStore(family).store, network({ chat: echo(status), key: echo(status) })).handle(post('extract', { text: 'Soup' })));
      runs.push(handler(fakeStore({ mode: 'free' }).store, network({ key: echo(status) })).handle(post('key', { key: FAMILY_KEY })));
    }
    runs.push(handler(fakeStore({ mode: 'free' }).store).handle(post('extract', { text: 'Soup' })));
    runs.push(handler(fakeStore(family).store).handle(post('extract', { text: 'Soup' })));
    runs.push(handler(fakeStore({ mode: 'free' }).store).handle(post('key', { key: FAMILY_KEY })));
    runs.push(handler(fakeStore({ mode: 'free' }).store).handle(post('extract', { text: 'Soup' }, null)));
    runs.push(handler({ claim: vi.fn(async () => { throw new Error(`boom ${TOKEN} ${FAMILY_KEY}`); }), familyId: vi.fn(), storeKey: vi.fn() }).handle(post('extract', { text: 'Soup' })));
    for (const response of await Promise.all(runs)) {
      const text = await response.text();
      for (const secret of [TOKEN, FAMILY_KEY, SHARED, SECRET]) expect(text).not.toContain(secret);
    }
  });
});

describe('POST /api/ai/extract, a URL', () => {
  it('reads the page and answers with the url, site and image from our own reading of it', async () => {
    const { handle, net } = handler(fakeStore({ mode: 'free' }).store);
    const response = await handle(post('extract', { url: PAGE }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { recipe: Record<string, unknown>; report: { found: string[]; missing: string[] } };
    expect(body.recipe).toMatchObject({ title: 'Lentil soup', url: PAGE, site: 'example.com', image: 'https://example.com/soup.jpg' });
    expect(body.report).toEqual({ found: ['title', 'photo', 'servings'], missing: ['calories'] });
    expect(sentUser(net)).toContain('1 cup lentils. Simmer.');
    expect(net.calls.map((call) => call.url)).toEqual([PAGE, 'https://openrouter.ai/api/v1/chat/completions']);
  });

  it('answers with the final url after a redirect', async () => {
    let hops = 0;
    const page = () => (hops++ === 0 ? new Response(null, { status: 301, headers: { location: `${PAGE}/final` } }) : new Response(PAGE_HTML));
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ page }));
    const { recipe } = (await (await handle(post('extract', { url: PAGE }))).json()) as { recipe: Record<string, unknown> };
    expect(recipe).toMatchObject({ url: `${PAGE}/final`, site: 'example.com', image: 'https://example.com/soup.jpg' });
  });

  it('leaves out the image when the page has none', async () => {
    const page = () => new Response('<html><body><p>1 cup lentils. Simmer.</p></body></html>');
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ page }));
    const { recipe, report } = (await (await handle(post('extract', { url: PAGE }))).json()) as { recipe: Record<string, unknown>; report: { missing: string[] } };
    expect(recipe).not.toHaveProperty('image');
    expect(report.missing).toEqual(['photo', 'calories']);
  });

  it('uses the family key for a page too, decrypting it after the fetch', async () => {
    const { handle, net } = handler(fakeStore(await familyClaim()).store);
    expect((await handle(post('extract', { url: PAGE }))).status).toBe(200);
    expect(sentAuth(net)).toBe(`Bearer ${FAMILY_KEY}`);
  });

  it('checks the url before it asks the store', async () => {
    for (const [url, error] of [['ftp://x', 'invalid-url'], ['not a url', 'invalid-url'], ['http://127.0.0.1/', 'blocked'], ['http://localhost/x', 'blocked'], ['https://user:pw@example.com/', 'blocked']] as const) {
      const { store } = fakeStore({ mode: 'free' });
      const { handle, net } = handler(store);
      const response = await handle(post('extract', { url }));
      expect(response.status, url).toBe(400);
      expect(await response.json(), url).toEqual({ error });
      expect(store.claim, url).not.toHaveBeenCalled();
      expect(net.calls, url).toHaveLength(0);
    }
  });

  it('refuses a name that resolves to a private address, before the store', async () => {
    const { store } = fakeStore({ mode: 'free' });
    const { handle } = handler(store, network(), { resolveHost: async () => ['10.0.0.5'] });
    const response = await handle(post('extract', { url: PAGE }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'blocked' });
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('checks the claim and the configuration before it fetches the page', async () => {
    const family = await familyClaim();
    const cases = [
      ['no reads left', handler(fakeStore({ mode: 'quota-exceeded', scope: 'user' }).store), 429],
      ['a refused token', handler(fakeStore('unauthorized').store), 401],
      ['no shared key', handler(fakeStore({ mode: 'free' }).store, network(), { openRouterKey: undefined }), 503],
      ['no secret', handler(fakeStore(family).store, network(), { keySecret: undefined }), 503],
    ] as const;
    for (const [name, { handle, net }, status] of cases) {
      expect((await handle(post('extract', { url: PAGE }))).status, name).toBe(status);
      expect(net.calls.map((call) => call.url), name).not.toContain(PAGE);
    }
  });

  it('decrypts the family key only after the page is fetched', async () => {
    const claim = await familyClaim();
    const { handle, net } = handler(fakeStore({ ...claim, familyId: '22222222-2222-4222-8222-222222222222' } as ClaimResult).store);
    const response = await handle(post('extract', { url: PAGE }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'key-invalid' });
    expect(net.calls.map((call) => call.url)).toEqual([PAGE]);
  });

  it('answers fetch-failed for a page that is not there, after the claim', async () => {
    const { store } = fakeStore({ mode: 'free' });
    const { handle, net } = handler(store, network({ page: () => new Response('gone', { status: 404 }) }));
    const response = await handle(post('extract', { url: PAGE }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'fetch-failed' });
    expect(store.claim).toHaveBeenCalledTimes(1);
    expect(net.calls.some((call) => call.url.includes('openrouter'))).toBe(false);
  });

  it('answers not-a-recipe for a page with no text, without calling the model', async () => {
    const { handle, net } = handler(fakeStore({ mode: 'free' }).store, network({ page: () => new Response('<html><body><script>x</script></body></html>') }));
    const response = await handle(post('extract', { url: PAGE }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'not-a-recipe' });
    expect(net.calls.some((call) => call.url.includes('openrouter'))).toBe(false);
  });

  it('answers too-large for a page over 5 MB', async () => {
    const page = () => new Response('a'.repeat(5 * 1024 * 1024 + 1));
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ page }));
    const response = await handle(post('extract', { url: PAGE }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'too-large' });
  });

  it('never lets the model set the image', async () => {
    const { handle } = handler(fakeStore({ mode: 'free' }).store, network({ chat: () => completion({ ...goodAnswer, image: 'https://evil.example/x.jpg' }) }));
    expect((await handle(post('extract', { url: PAGE }))).status).toBe(502);
  });

  it('reduces only the first million characters of a page (CPU and memory on Workers)', async () => {
    // The filler reduces to nothing, so only the cap keeps SECRET-LINE from the model; a long run of plain text would be cut at 20,000 characters either way.
    const html = `<body><p>FIRST-LINE</p><script>${'a'.repeat(1_000_000)}</script><p>SECRET-LINE</p></body>`;
    const { handle, net } = handler(fakeStore({ mode: 'free' }).store, network({ page: () => new Response(html) }));
    await handle(post('extract', { url: PAGE }));
    const user = sentUser(net);
    expect(user).toContain('FIRST-LINE');
    expect(user).not.toContain('SECRET-LINE');
  });
});

describe('POST /api/ai/key', () => {
  const NEW_KEY = FAMILY_KEY;

  it('checks the key, then stores it encrypted for the family with a hint', async () => {
    const { store, stored } = fakeStore({ mode: 'free' });
    const { handle, net, log } = handler(store);
    const response = await handle(post('key', { key: ` ${NEW_KEY}\n` }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ saved: true });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.ciphertext).toMatch(/^v1:/);
    expect(stored[0]!.ciphertext).not.toContain(NEW_KEY);
    expect(stored[0]!.hint).toBe(NEW_KEY.slice(-4));
    expect(await decryptKey(stored[0]!.ciphertext, FAMILY, (await importSecret(SECRET))!)).toBe(NEW_KEY);
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]!.url).toBe('https://openrouter.ai/api/v1/key');
    expect((net.calls[0]!.init!.headers as Record<string, string>).authorization).toBe(`Bearer ${NEW_KEY}`);
    expect(log.mock.calls).toEqual([[{ route: 'key' }]]);
  });

  it('answers unauthorized without a token, and asks nobody: it is no anonymous oracle for keys', async () => {
    const { store } = fakeStore({ mode: 'free' });
    const { handle, net } = handler(store);
    const response = await handle(post('key', { key: NEW_KEY }, null));
    expect(response.status).toBe(401);
    expect(net.calls).toHaveLength(0);
    expect(store.familyId).not.toHaveBeenCalled();
  });

  it('answers key-invalid for a key of the wrong shape, without asking OpenRouter', async () => {
    for (const key of ['hello', 'sk-or-short', 'sk-or-' + 'a'.repeat(201), `${NEW_KEY} extra`, 'sk-or-v1-' + 'a'.repeat(20) + '!']) {
      const { handle, net } = handler(fakeStore({ mode: 'free' }).store);
      const response = await handle(post('key', { key }));
      expect(response.status, key).toBe(422);
      expect(await response.json(), key).toEqual({ error: 'key-invalid' });
      expect(net.calls, key).toHaveLength(0);
    }
  });

  it('answers invalid-input for a body without a key', async () => {
    for (const body of [{}, { key: 5 }, { key: null }, 'not json', []]) {
      const { handle, net } = handler(fakeStore({ mode: 'free' }).store);
      const response = await handle(post('key', body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-input' });
      expect(net.calls).toHaveLength(0);
    }
  });

  it('answers too-large for a body over 128 KB', async () => {
    const { handle, net } = handler(fakeStore({ mode: 'free' }).store);
    const response = await handle(post('key', JSON.stringify({ key: 'sk-or-' + 'a'.repeat(129 * 1024) })));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'too-large' });
    expect(net.calls).toHaveLength(0);
  });

  it('is unavailable without AI_KEY_SECRET or without Supabase settings', async () => {
    for (const extra of [{ keySecret: undefined }, { keySecret: btoa('short') }, { store: undefined }]) {
      const { handle, net } = handler(fakeStore({ mode: 'free' }).store, network(), extra);
      expect((await handle(post('key', { key: NEW_KEY }))).status).toBe(503);
      expect(net.calls).toHaveLength(0);
    }
  });

  it('answers unauthorized for a member in no family, and does not ask OpenRouter', async () => {
    for (const familyId of [null, 'unauthorized'] as const) {
      const { store, stored } = fakeStore({ mode: 'free' }, familyId);
      const { handle, net } = handler(store);
      expect((await handle(post('key', { key: NEW_KEY }))).status).toBe(401);
      expect(net.calls).toHaveLength(0);
      expect(stored).toHaveLength(0);
    }
  });

  it('answers unauthorized when the database refuses the store, and 503 when it cannot be reached', async () => {
    const refusing = { ...fakeStore({ mode: 'free' }).store, storeKey: vi.fn(async () => 'unauthorized' as const) };
    expect((await handler(refusing).handle(post('key', { key: NEW_KEY }))).status).toBe(401);
    const broken = { ...fakeStore({ mode: 'free' }).store, storeKey: vi.fn(async () => { throw new Error('down'); }) };
    expect((await handler(broken).handle(post('key', { key: NEW_KEY }))).status).toBe(503);
  });

  const refused: [string, () => Response, number, string][] = [
    ['a 401', () => reply({}, 401), 422, 'key-invalid'],
    ['a management key', () => reply({ data: { is_management_key: true } }), 422, 'key-invalid'],
    ['a provisioning key', () => reply({ data: { is_provisioning_key: true } }), 422, 'key-invalid'],
    ['no credit left', () => reply({ data: { limit_remaining: 0 } }), 402, 'key-out-of-credit'],
    ['a 500', () => reply({}, 500), 503, 'unavailable'],
    ['an answer with no data', () => reply({}), 503, 'unavailable'],
  ];
  for (const [name, key, status, error] of refused) {
    it(`stores nothing when OpenRouter answers ${name}`, async () => {
      const { store, stored } = fakeStore({ mode: 'free' });
      const { handle } = handler(store, network({ key }));
      const response = await handle(post('key', { key: NEW_KEY }));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
      expect(stored).toHaveLength(0);
      expect(store.storeKey).not.toHaveBeenCalled();
    });
  }
});

describe('routing', () => {
  it('answers method for any other method or path', async () => {
    const { handle, net } = handler(fakeStore({ mode: 'free' }).store);
    for (const request of [
      new Request('http://localhost/api/ai/extract'),
      new Request('http://localhost/api/ai/extract', { method: 'PUT', body: '{}' }),
      new Request('http://localhost/api/ai/key', { method: 'DELETE' }),
      post('other', { text: 'Soup' }),
      post('', { text: 'Soup' }),
    ]) {
      const response = await handle(request);
      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: 'method' });
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(net.calls).toHaveLength(0);
  });

  it('serves both routes with or without a trailing slash', async () => {
    const { handle } = handler(fakeStore({ mode: 'free' }).store);
    expect((await handle(post('extract/', { text: 'Soup' }))).status).toBe(200);
    expect((await handle(post('key/', { key: FAMILY_KEY }))).status).toBe(200);
  });
});
