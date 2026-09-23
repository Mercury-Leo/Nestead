// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkUrl, createImportHandler, detectEquipment, isoMinutes, parseRecipeHtml } from './import';

const fixture = readFileSync(new URL('../tests/fixtures/gnocchi.html', import.meta.url), 'utf8');
const URL_ = 'https://weeknightpan.co/recipes/crispy-skillet-gnocchi';

describe('parseRecipeHtml', () => {
  it('reads the gnocchi fixture from JSON-LD in an @graph', () => {
    const parsed = parseRecipeHtml(fixture, URL_);
    expect(parsed).not.toBeNull();
    const recipe = parsed?.recipe;
    expect(recipe).toMatchObject({
      site: 'weeknightpan.co',
      title: 'Crispy Skillet Gnocchi with Cherry Tomatoes',
      description: 'Shop-bought gnocchi roasted until crisp with jammy tomatoes & melting mozzarella.',
      image: 'https://weeknightpan.co/images/crispy-skillet-gnocchi.jpg',
      servings: 4,
      prepMin: 10,
      cookMin: 25,
      rating: 4.6,
      equipment: ['Large oven-safe skillet', 'Mixing bowl'],
    });
    expect(recipe?.ingredients).toHaveLength(9);
    expect(recipe?.ingredients[6]).toBe('½ tsp fine salt');
    expect(recipe?.steps).toHaveLength(5);
    expect(recipe?.kcal).toBeUndefined();
    expect(parsed?.report.missing).toEqual(['calories']);
  });

  it('falls back to microdata', () => {
    const html = `<div itemscope itemtype="https://schema.org/Recipe">
      <h1 itemprop="name">Toast</h1>
      <meta itemprop="prepTime" content="PT2M">
      <span itemprop="recipeYield">2 slices</span>
      <li itemprop="recipeIngredient">2 slices bread</li>
      <li itemprop="recipeIngredient">1 tbsp butter</li>
      <p itemprop="recipeInstructions">Toast the bread in a frying pan for 2 min.</p>
    </div>`;
    const parsed = parseRecipeHtml(html, 'https://toast.example/t');
    expect(parsed?.recipe).toMatchObject({
      title: 'Toast',
      prepMin: 2,
      servings: 2,
      servingUnit: 'slice',
      ingredients: ['2 slices bread', '1 tbsp butter'],
      equipment: ['Frying pan'],
    });
  });

  it('returns null when there is no recipe', () => {
    expect(parseRecipeHtml('<html><body>Just a blog</body></html>', URL_)).toBeNull();
  });

  it('reads ISO-8601 durations and finds equipment in steps', () => {
    expect(isoMinutes('PT1H15M')).toBe(75);
    expect(isoMinutes('P0DT0H45M')).toBe(45);
    expect(detectEquipment(['Warm a large cast-iron skillet.', 'Whisk in a mixing bowl.'])).toEqual([
      'Large cast-iron skillet',
      'Mixing bowl',
      'Whisk',
    ]);
  });
});

describe('SSRF guard', () => {
  it.each([
    ['ftp://example.com/x', 'invalid-url'],
    ['not a url', 'invalid-url'],
    ['http://localhost:5173/', 'blocked'],
    ['http://127.0.0.1/', 'blocked'],
    ['http://10.0.0.8/', 'blocked'],
    ['http://192.168.1.1/', 'blocked'],
    ['http://169.254.169.254/latest/meta-data', 'blocked'],
    ['http://[::1]/', 'blocked'],
    ['http://printer.local/', 'blocked'],
    ['http://user:pw@example.com/', 'blocked'],
    ['https://weeknightpan.co/recipes/x', null],
    ['http://93.184.216.34/', null],
  ])('%s -> %s', async (url, expected) => {
    expect(await checkUrl(url)).toBe(expected);
  });

  it('blocks names that resolve to private addresses', async () => {
    expect(await checkUrl('https://sneaky.example.com/', async () => ['10.1.2.3'])).toBe('blocked');
    expect(await checkUrl('https://fine.example.com/', async () => ['93.184.216.34'])).toBeNull();
  });
});

describe('import handler', () => {
  const page = (body: string, init: ResponseInit = {}): Response => new Response(body, { status: 200, ...init });

  it('fetches and parses a page', async () => {
    const handler = createImportHandler({ fetch: async () => page(fixture) });
    const response = await handler(new Request('http://app/api/import', { method: 'POST', body: JSON.stringify({ url: URL_ }) }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { recipe: { title: string } };
    expect(body.recipe.title).toBe('Crispy Skillet Gnocchi with Cherry Tomatoes');
  });

  it('re-checks every redirect', async () => {
    const handler = createImportHandler({
      fetch: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
    });
    const response = await handler(new Request(`http://app/api/import?url=${encodeURIComponent(URL_)}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'blocked' });
  });

  it('refuses pages over the size cap', async () => {
    const handler = createImportHandler({ maxBytes: 100, fetch: async () => page('x'.repeat(1000)) });
    const response = await handler(new Request(`http://app/api/import?url=${encodeURIComponent(URL_)}`));
    expect(await response.json()).toEqual({ error: 'too-large' });
  });

  it('says so when a page has no recipe', async () => {
    const handler = createImportHandler({ fetch: async () => page('<p>hello</p>') });
    const response = await handler(new Request(`http://app/api/import?url=${encodeURIComponent(URL_)}`));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'not-found' });
  });

  it('times out', async () => {
    const handler = createImportHandler({
      timeoutMs: 50,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    });
    const response = await handler(new Request(`http://app/api/import?url=${encodeURIComponent(URL_)}`));
    expect(await response.json()).toEqual({ error: 'timeout' });
  });
});
