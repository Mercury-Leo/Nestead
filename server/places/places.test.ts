import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createPlacesHandler, PlacesProviderError, photonProvider, photonUrl, planQuery, toSuggestions } from '.';
import type { AddressProvider, AddressQuery } from '.';

const get = (q: string, method = 'GET'): Request => new Request(`http://localhost/api/places?q=${encodeURIComponent(q)}`, { method });

/** A provider that answers what it is told, and records what it was asked. */
function fake(answer: AddressProvider['suggest']): AddressProvider & { asked: AddressQuery[] } {
  const asked: AddressQuery[] = [];
  return {
    asked,
    suggest: (query, signal) => {
      asked.push(query);
      return answer(query, signal);
    },
  };
}

describe('the places handler', () => {
  it('answers what the provider suggests, cached for a day', async () => {
    const provider = fake(async () => [{ street: 'Herzl 12', city: 'Rishon LeZion', country: 'Israel' }]);
    const response = await createPlacesHandler({ provider })(get('  herzl   12 '));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=86400');
    expect(await response.json()).toEqual({ results: [{ street: 'Herzl 12', city: 'Rishon LeZion', country: 'Israel' }] });
    expect(provider.asked).toEqual([{ text: 'herzl 12', language: 'en', limit: 6 }]);
  });

  it("passes on the provider's attribution", async () => {
    const provider = { suggest: async () => [], attribution: '© Somebody' };
    const response = await createPlacesHandler({ provider })(get('herzl'));
    expect(await response.json()).toEqual({ results: [], attribution: '© Somebody' });
    expect(photonProvider().attribution).toMatch(/OpenStreetMap/);
  });

  it('asks in Hebrew for a Hebrew query', () => {
    expect(planQuery('הרצל 12').language).toBe('he');
    expect(planQuery('Herzl 12').language).toBe('en');
  });

  it('refuses a query under 3 or over 200 characters, and other methods', async () => {
    const provider = fake(async () => []);
    const handler = createPlacesHandler({ provider });
    for (const q of ['', 'ab', 'x'.repeat(201)]) {
      const response = await handler(get(q));
      expect(response.status, q).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-query' });
    }
    expect((await handler(get('herzl', 'POST'))).status).toBe(405);
    expect(provider.asked).toEqual([]);
  });

  it("maps the provider's failures to statuses, uncached", async () => {
    const cases: [AddressProvider['suggest'], number, string][] = [
      [async () => Promise.reject(new PlacesProviderError('limit')), 429, 'limit'],
      [async () => Promise.reject(new PlacesProviderError('places-failed')), 502, 'places-failed'],
      [async () => Promise.reject(new Error('socket hang up')), 502, 'places-failed'],
    ];
    for (const [answer, status, error] of cases) {
      const response = await createPlacesHandler({ provider: fake(answer) })(get('herzl'));
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error });
    }
  });

  it('times a slow provider out', async () => {
    const slow = fake(
      (_query, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const response = await createPlacesHandler({ provider: slow, timeoutMs: 20 })(get('herzl'));
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'timeout' });
  });
});

/** Two real answers from photon.komoot.io for Herzl 12, Rishon LeZion, trimmed. */
const HOUSE_HE = {
  properties: { type: 'house', housenumber: '12', street: 'הרצל', district: 'אברמוביץ', city: 'ראשון לציון', country: 'ישראל', countrycode: 'IL' },
};
const HOUSE_EN = {
  properties: { type: 'house', housenumber: '12', street: 'Herzl', district: 'Abramovich', city: 'Rishon LeZion', country: 'Israel', countrycode: 'IL' },
};

describe('Photon', () => {
  it('asks for houses and streets near Israel, in English unless the query is Hebrew', () => {
    const en = new URL(photonUrl('https://photon.komoot.io/api/', planQuery('herzl 12')));
    expect(en.searchParams.get('q')).toBe('herzl 12');
    expect(en.searchParams.get('lang')).toBe('en');
    expect(en.searchParams.getAll('layer')).toEqual(['house', 'street']);
    expect(en.searchParams.get('limit')).toBe('12');
    expect([en.searchParams.get('lat'), en.searchParams.get('lon')]).toEqual(['31.5', '34.9']);

    // Photon refuses lang=he; without a language it names Israeli places in Hebrew.
    const he = new URL(photonUrl('https://photon.komoot.io/api/', planQuery('הרצל 12')));
    expect(he.searchParams.get('q')).toBe('הרצל 12');
    expect(he.searchParams.has('lang')).toBe(false);
  });

  it('turns houses and streets into suggestions, each once, and skips the rest', () => {
    const features = [
      HOUSE_HE,
      HOUSE_HE,
      HOUSE_EN,
      { properties: { type: 'street', name: 'Herzl Street', locality: 'Kiryat Tivon', country: 'Israel' } },
      { properties: { type: 'house', housenumber: '3', street: 'Nowhere Road' } },
      { properties: { type: 'city', name: 'Herzliya', country: 'Israel' } },
      { properties: { type: 'house', street: 'Weizmann', district: 'Kfar Saba' } },
      null,
      'junk',
    ];
    expect(toSuggestions(features, 6)).toEqual([
      { street: 'הרצל 12', city: 'ראשון לציון', country: 'ישראל' },
      { street: 'Herzl 12', city: 'Rishon LeZion', country: 'Israel' },
      { street: 'Herzl Street', city: 'Kiryat Tivon', country: 'Israel' },
      { street: 'Weizmann', city: 'Kfar Saba' },
    ]);
    expect(toSuggestions(features, 2)).toHaveLength(2);
    expect(toSuggestions(undefined, 6)).toEqual([]);
  });

  it('identifies the app, and reports throttling and failures as provider errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [HOUSE_EN] }), { status: 200 }));
    const provider = photonProvider({ fetch: fetchMock as unknown as typeof fetch, baseUrl: 'https://photon.example/api/' });
    expect(await provider.suggest(planQuery('herzl 12'), new AbortController().signal)).toEqual([
      { street: 'Herzl 12', city: 'Rishon LeZion', country: 'Israel' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith('https://photon.example/api/?')).toBe(true);
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/Nestead/);

    for (const [status, code] of [[429, 'limit'], [500, 'places-failed'], [400, 'places-failed']] as const) {
      const failing = photonProvider({ fetch: (async () => new Response('', { status })) as unknown as typeof fetch });
      await expect(failing.suggest(planQuery('herzl'), new AbortController().signal)).rejects.toMatchObject({ code });
    }
  });
});

describe('the swap point', () => {
  it('keeps the browser code free of any address service: it calls /api/places only', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && /photon|komoot/i.test(readFileSync(path, 'utf8'))) offenders.push(path);
      }
    };
    walk(join(__dirname, '../../src'));
    expect(offenders).toEqual([]);
  });

  it('names Photon in provider.ts and nowhere else outside photon.ts', () => {
    const outside = ['handler.ts', 'types.ts', '../../functions/api/places.ts', '../../vite.config.ts'];
    for (const file of outside) expect(readFileSync(join(__dirname, file), 'utf8'), file).not.toMatch(/photon/i);
    expect(readFileSync(join(__dirname, 'provider.ts'), 'utf8')).toMatch(/photonProvider\(\)/);
  });
});
