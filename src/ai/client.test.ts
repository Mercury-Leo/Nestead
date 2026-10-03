import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../i18n';
import { aiErrorMessage, extractRecipe, nextUtcMidnight, saveFamilyKey } from './client';
import type { FamilyAi } from './client';

const ai = (token: string | null = 'tok'): FamilyAi => ({
  token: async () => token,
  status: async () => ({ free: { used: 0, limit: 5, left: 5 } }),
  clearKey: async () => {},
  setModel: async () => {},
});
const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('extractRecipe', () => {
  it('sends the token and returns the recipe', async () => {
    const fetch = answer({ recipe: { title: 'Soup', ingredients: ['1 egg'], steps: [], equipment: [] }, report: { found: ['title'], missing: [] } });
    vi.stubGlobal('fetch', fetch);
    const outcome = await extractRecipe(ai(), { text: 'Soup' });
    expect(outcome).toMatchObject({ kind: 'ok', recipe: { title: 'Soup' } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/extract');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Soup' });
  });

  it('passes the error code and quota scope through', async () => {
    vi.stubGlobal('fetch', answer({ error: 'quota-exceeded', scope: 'app' }, 429));
    expect(await extractRecipe(ai(), { url: 'https://x.example' })).toEqual({ kind: 'error', code: 'quota-exceeded', scope: 'app' });
  });

  it('asks nobody when signed out, and says unavailable for a non-JSON answer', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await extractRecipe(ai(null), { text: 'x' })).toEqual({ kind: 'error', code: 'unauthorized' });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    expect(await extractRecipe(ai(), { text: 'x' })).toEqual({ kind: 'error', code: 'unavailable' });
  });
});

describe('saveFamilyKey', () => {
  it('posts the key once and reports saved', async () => {
    const fetch = answer({ saved: true });
    vi.stubGlobal('fetch', fetch);
    expect(await saveFamilyKey(ai(), 'sk-or-v1-abc')).toEqual({ kind: 'ok' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/key');
    expect(JSON.parse(init.body as string)).toEqual({ key: 'sk-or-v1-abc' });
  });
});

describe('aiErrorMessage', () => {
  it('has words for every code, by what was being read', () => {
    const codes = ['offline', 'unauthorized', 'invalid-input', 'too-large', 'quota-exceeded', 'key-invalid', 'key-out-of-credit', 'model-failed', 'not-a-recipe', 'timeout', 'unavailable', 'method', 'invalid-url', 'blocked', 'fetch-failed'] as const;
    for (const code of codes) {
      for (const input of ['text', 'url', 'key'] as const) {
        const { message } = aiErrorMessage(code, { input });
        expect(message, `${code}/${input}`).not.toBe('');
        expect(message, `${code}/${input}`).not.toMatch(/^ai\.|^import\./);
      }
    }
  });

  it('tells a used-up person from a used-up app', () => {
    const now = new Date('2026-10-03T21:30:00Z');
    expect(aiErrorMessage('quota-exceeded', { input: 'text', scope: 'user', now }).message).toContain('5 free AI reads');
    expect(aiErrorMessage('quota-exceeded', { input: 'text', scope: 'app', now }).message).toContain('used up for today');
  });

  it('tells a rejected new key from a stored key that stopped working', () => {
    expect(aiErrorMessage('key-invalid', { input: 'key' }).message).toBe(i18n.t('ai.error.keyRejected'));
    expect(aiErrorMessage('key-invalid', { input: 'url' }).message).toBe(i18n.t('ai.error.keyBroken'));
  });

  it('offers writing it yourself when the AI found nothing', () => {
    expect(aiErrorMessage('not-a-recipe', { input: 'text' }).offerWrite).toBe(true);
  });

  it('knows when free reads come back', () => {
    expect(nextUtcMidnight(new Date('2026-10-03T21:30:00Z')).toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(nextUtcMidnight(new Date('2026-12-31T00:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
