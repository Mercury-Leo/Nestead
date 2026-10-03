// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MAX_COMPLETION_TOKENS, OPENROUTER, callChat, chatBody, chatError, checkKey, freeModelList, isModelId } from './openrouter';
import { strictFetch } from './testing';

const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const completion = (content: unknown, finish = 'stop', extra: Record<string, unknown> = {}) =>
  ({ model: 'meta-llama/llama-3.3-70b-instruct:free', choices: [{ finish_reason: finish, message: { role: 'assistant', content } }], ...extra });

describe('model ids', () => {
  it('accepts plain vendor/model ids, with or without :free', () => {
    for (const id of ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-235b-a22b-2507']) {
      expect(isModelId(id), id).toBe(true);
    }
  });

  it('refuses variants, aliases, routers and anything else', () => {
    for (const id of ['openai/gpt-4o:online', 'openai/gpt-4o:nitro', '~anthropic/claude-sonnet-latest', 'openrouter/auto', 'gpt-4o', 'Google/Gemini', `a/${'b'.repeat(100)}`, '']) {
      expect(isModelId(id), id).toBe(false);
    }
  });

  it('keeps the first three valid :free ids from the list, in order', () => {
    expect(freeModelList(' a/one:free, openai/gpt-4o ,b/two:free,bad id,c/three:free, d/four:free')).toEqual(['a/one:free', 'b/two:free', 'c/three:free']);
    expect(freeModelList(undefined)).toEqual([]);
  });
});

describe('chatBody', () => {
  it('sends the fixed request and nothing else', () => {
    const body = chatBody('1 onion', 'n0nce', { models: ['a/one:free', 'b/two:free'] });
    expect(Object.keys(body).sort()).toEqual(['max_completion_tokens', 'messages', 'model', 'models', 'provider', 'response_format', 'stream', 'temperature']);
    expect(body).toMatchObject({
      model: 'a/one:free',
      models: ['a/one:free', 'b/two:free'],
      provider: { require_parameters: true },
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      temperature: 0,
      stream: false,
      response_format: { type: 'json_schema', json_schema: { name: 'recipe', strict: true } },
    });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages.map((message) => message.role)).toEqual(['system', 'user']);
    expect(messages[1]?.content).toBe('<<<RECIPE n0nce>>>\n1 onion\n<<<END n0nce>>>');
  });

  it('sends a chosen model alone, without fallbacks', () => {
    const body = chatBody('x', 'n', { model: 'google/gemini-2.5-flash' });
    expect(body.model).toBe('google/gemini-2.5-flash');
    expect('models' in body).toBe(false);
  });
});

describe('callChat', () => {
  const options = (fetch: typeof globalThis.fetch) => ({ fetch, timeoutMs: 1000 });

  it('posts with the key and returns the content and the model that answered', async () => {
    const fetch = vi.fn(async () => reply(completion('{"a":1}')));
    expect(await callChat('sk-or-test', { model: 'x/y' }, options(fetch))).toEqual({ kind: 'content', content: '{"a":1}', model: 'meta-llama/llama-3.3-70b-instruct:free' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${OPENROUTER}/chat/completions`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-test');
  });

  it('calls fetch unbound so Illegal invocation does not throw on Workers and browsers', async () => {
    // strictFetch only works when called unbound (this === undefined)
    // If the code did options.fetch(...), this would be options and it would throw
    expect(await callChat('sk', { model: 'x/y' }, options(strictFetch(() => reply(completion('{}'))))))
      .toEqual({ kind: 'content', content: '{}', model: 'meta-llama/llama-3.3-70b-instruct:free' });
  });

  it('treats any finish but stop, an error object or missing content as incomplete', async () => {
    for (const body of [completion('{}', 'length'), completion('{}', 'error'), completion('{}', 'content_filter'), completion(null), completion('{}', 'stop', { error: { code: 502 } }), { choices: [] }]) {
      expect(await callChat('k', {}, options(vi.fn(async () => reply(body))))).toEqual({ kind: 'incomplete' });
    }
  });

  it('takes an error of null, at the top or on the choice, for no error', async () => {
    const choice = { finish_reason: 'stop', error: null, message: { role: 'assistant', content: '{"a":1}' } };
    for (const body of [completion('{"a":1}', 'stop', { error: null }), { model: 'x/y', error: null, choices: [choice] }]) {
      expect(await callChat('k', {}, options(vi.fn(async () => reply(body))))).toMatchObject({ kind: 'content', content: '{"a":1}' });
    }
    // An error object on the choice still fails the call.
    expect(await callChat('k', {}, options(vi.fn(async () => reply({ choices: [{ ...choice, error: { code: 502 } }] }))))).toEqual({ kind: 'incomplete' });
  });

  it('reports the status of a refused call, a network failure and the time limit', async () => {
    expect(await callChat('k', {}, options(vi.fn(async () => reply({ error: { code: 402 } }, 402))))).toEqual({ kind: 'http', status: 402 });
    expect(await callChat('k', {}, options(vi.fn(async () => { throw new TypeError('network'); })))).toEqual({ kind: 'network' });
    const hang = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    expect(await callChat('k', {}, { fetch: hang, timeoutMs: 10 })).toEqual({ kind: 'timeout' });
  });
});

describe('chatError', () => {
  it('maps OpenRouter answers for the free tier and for a family key', () => {
    const http = (status: number) => ({ kind: 'http' as const, status });
    expect(chatError(http(401), 'free')).toEqual({ error: 'unavailable' });
    expect(chatError(http(401), 'family')).toEqual({ error: 'key-invalid' });
    expect(chatError(http(402), 'free')).toEqual({ error: 'unavailable' });
    expect(chatError(http(402), 'family')).toEqual({ error: 'key-out-of-credit' });
    expect(chatError(http(429), 'free')).toEqual({ error: 'quota-exceeded', scope: 'app' });
    expect(chatError(http(429), 'family')).toEqual({ error: 'model-failed' });
    expect(chatError(http(408), 'free')).toEqual({ error: 'timeout' });
    for (const status of [400, 403, 404, 413, 422, 500, 502, 503, 524, 529]) expect(chatError(http(status), 'family')).toEqual({ error: 'model-failed' });
    expect(chatError({ kind: 'timeout' }, 'free')).toEqual({ error: 'timeout' });
    expect(chatError({ kind: 'network' }, 'free')).toEqual({ error: 'model-failed' });
    expect(chatError({ kind: 'incomplete' }, 'family')).toEqual({ error: 'model-failed' });
  });
});

describe('checkKey', () => {
  const run = (response: Response | Error) => checkKey('sk-or-v1-abc', { fetch: vi.fn(async () => { if (response instanceof Error) throw response; return response; }), timeoutMs: 1000 });
  const data = (fields: Record<string, unknown>) => reply({ data: { limit_remaining: null, is_management_key: false, is_provisioning_key: false, ...fields } });

  it('accepts a working key, with or without a limit left', async () => {
    expect(await run(data({}))).toBe('ok');
    expect(await run(data({ limit_remaining: 4.5 }))).toBe('ok');
  });

  it('refuses a key OpenRouter does not know, and keys that can make keys', async () => {
    expect(await run(reply({ error: { code: 401 } }, 401))).toBe('key-invalid');
    expect(await run(data({ is_management_key: true }))).toBe('key-invalid');
    expect(await run(data({ is_provisioning_key: true }))).toBe('key-invalid');
  });

  it('says when the key has no credit left', async () => {
    expect(await run(data({ limit_remaining: 0 }))).toBe('key-out-of-credit');
    expect(await run(data({ limit_remaining: -0.5 }))).toBe('key-out-of-credit');
  });

  it('answers unavailable when OpenRouter cannot say', async () => {
    expect(await run(reply({}, 500))).toBe('unavailable');
    expect(await run(new TypeError('network'))).toBe('unavailable');
    expect(await run(reply({ nothing: true }))).toBe('unavailable');
  });

  it('calls fetch with the right URL and authorization header', async () => {
    const fetch = vi.fn(async () => data({}));
    await checkKey('sk-test-key', { fetch, timeoutMs: 1000 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${OPENROUTER}/key`);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-key');
  });

  it('calls fetch unbound so Illegal invocation does not throw on Workers and browsers', async () => {
    // strictFetch only works when called unbound (this === undefined)
    // If the code did options.fetch(...), this would be options and it would throw
    expect(await checkKey('sk', { fetch: strictFetch(() => data({})), timeoutMs: 1000 })).toBe('ok');
  });
});

