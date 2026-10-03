// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ENGLISH_SITES, HEBREW_SITES, cleanTitle, createSearchHandler, planSearch, toHits } from '.';
import type { RecipeSite } from '.';

function site(domain: string): RecipeSite {
  const found = [...ENGLISH_SITES, ...HEBREW_SITES].find((entry) => entry.domain === domain);
  if (found === undefined) throw new Error(`no site ${domain}`);
  return found;
}

const KEY = 'tvly-test-key';

function get(query: string): Request {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(query)}`);
}

/** A stand-in for Tavily that answers every call with these results, or this status. */
function tavily(results: unknown[] = [], status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(status === 200 ? { query: 'q', results } : { detail: { error: 'nope' } }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('planSearch', () => {
  it('looks in the English sites for an English query, asking for recipes', () => {
    const plan = planSearch('chicken chasseur');
    expect(plan.sites).toBe(ENGLISH_SITES);
    expect(plan.query).toBe('chicken chasseur recipe');
    expect(planSearch('Recipes with leeks').query).toBe('Recipes with leeks');
  });

  it('looks in the Hebrew sites for a query with Hebrew letters', () => {
    const plan = planSearch('עוגת שוקולד');
    expect(plan.sites).toBe(HEBREW_SITES);
    expect(plan.query).toBe('מתכון עוגת שוקולד');
    expect(planSearch('מתכונים לשבת').query).toBe('מתכונים לשבת');
    expect(planSearch('פסטה carbonara').sites).toBe(HEBREW_SITES);
  });
});

describe('toHits', () => {
  it('keeps single recipe pages on the listed sites, each once', () => {
    const hits = toHits(
      [
        { url: 'https://www.bbcgoodfood.com/recipes/focaccia', title: ' Focaccia  recipe ', content: 'A light, airy bread.', images: ['https://images.example/focaccia.jpg'] },
        { url: 'https://www.bbcgoodfood.com/recipes/collection/bread-recipes', title: 'Bread recipes' },
        { url: 'https://www.bbcgoodfood.com/recipes/focaccia/#method', title: 'Focaccia, again' },
        { url: 'https://www.bbc.co.uk/news/articles/c0000000', title: 'A news story' },
        { url: 'https://recipes.example.com/recipes/focaccia', title: 'Not a listed site' },
        { url: 'javascript:alert(1)', title: 'Not a web page' },
        { url: 'https://www.bbc.co.uk/food/recipes/easy_pancakes_36155', title: 'Easy pancakes', content: '   ', images: [{ url: 'http://insecure.example/p.jpg' }, { url: 'https://ichef.example/p.jpg' }] },
        { url: 'https://pinchofyum.com/thai-peanut-chicken-bowls', title: '' },
      ],
      ENGLISH_SITES,
    );
    expect(hits).toEqual([
      { url: 'https://www.bbcgoodfood.com/recipes/focaccia', site: 'bbcgoodfood.com', title: 'Focaccia recipe', image: 'https://images.example/focaccia.jpg' },
      { url: 'https://www.bbc.co.uk/food/recipes/easy_pancakes_36155', site: 'bbc.co.uk', title: 'Easy pancakes', image: 'https://ichef.example/p.jpg' },
    ]);
  });

  it('reads the Hebrew sites, whose paths arrive percent-encoded', () => {
    const foody = 'https://foody.co.il/foody_recipe/%d7%a9%d7%a0%d7%99%d7%a6%d7%9c/';
    const hits = toHits(
      [
        { url: foody, title: 'שניצל' },
        { url: 'https://foody.co.il/category/%d7%a2%d7%95%d7%a3/', title: 'עוף' },
        { url: 'https://www.10dakot.co.il/recipe/%D7%9E%D7%A8%D7%A7-%D7%90%D7%A4%D7%95%D7%A0%D7%94/', title: 'מרק אפונה' },
        { url: 'https://www.mako.co.il/food-recipes/recipes_column-30-minutes/Recipe-c2545710fe7c0a1027.htm', title: 'שניצל תירס' },
        { url: 'https://www.mako.co.il/food-recipes/recipes_column-cakes/chocolate_cakes/Recipe-1cd5ab9bbbafa81027.htm', title: 'עוגת שוקולד' },
        { url: 'https://www.mako.co.il/news-israel/Article-c2545710fe7c0a1027.htm', title: 'חדשות' },
        { url: 'https://www.mako.co.il/food-cooking_magazine/Article-129ee06f5d92371027.htm', title: 'כתבה' },
        { url: 'https://food.walla.co.il/recipe/653045', title: 'בייגל בצל' },
        { url: 'https://www.lichtenstadt.com/2026/09/%d7%9c%d7%96%d7%a0%d7%99%d7%99%d7%aa-%d7%9b%d7%a8%d7%95%d7%91/', title: 'לזניית כרוב' },
        { url: 'https://www.lichtenstadt.com/wprm_print/%d7%9c%d7%96%d7%a0%d7%99%d7%99%d7%aa', title: 'הדפסה' },
      ],
      HEBREW_SITES,
    );
    expect(hits.map((hit) => hit.site)).toEqual(['foody.co.il', '10dakot.co.il', 'mako.co.il', 'mako.co.il', 'food.walla.co.il', 'lichtenstadt.com']);
    expect(hits[0]?.url).toBe(foody);
  });

  it('takes Food Network recipes with or without a chef in the path', () => {
    const hits = toHits(
      [
        { url: 'https://www.foodnetwork.com/recipes/chicken-and-stars-soup-13155493', title: 'Chicken and Stars Soup' },
        { url: 'https://www.foodnetwork.com/recipes/ina-garten/chicken-stew-with-biscuits-recipe-1947612', title: 'Chicken Stew' },
        { url: 'https://www.foodnetwork.com/recipes/photos/best-soup-recipes', title: 'Soup photos' },
      ],
      ENGLISH_SITES,
    );
    expect(hits.map((hit) => hit.title)).toEqual(['Chicken and Stars Soup', 'Chicken Stew']);
  });

  it('leaves out the page text, which is a chunk of the page rather than a description', () => {
    const [hit] = toHits([{ url: 'https://cookieandkate.com/best-lentil-soup-recipe/', title: 'Lentil soup', content: 'Title: Lentil soup | Cookie and Kate We use cookies…' }], ENGLISH_SITES);
    expect(hit).toEqual({ url: 'https://cookieandkate.com/best-lentil-soup-recipe/', site: 'cookieandkate.com', title: 'Lentil soup' });
  });

  it('stops at twelve', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ url: `https://www.recipetineats.com/dish-${i}/`, title: `Dish ${i}` }));
    expect(toHits(many, ENGLISH_SITES)).toHaveLength(12);
  });

  it('ignores anything that is not a list of results', () => {
    expect(toHits(undefined, ENGLISH_SITES)).toEqual([]);
    expect(toHits({ url: 'https://pinchofyum.com/x' }, ENGLISH_SITES)).toEqual([]);
    expect(toHits([null, 3, 'https://pinchofyum.com/x', { title: 'No address' }], ENGLISH_SITES)).toEqual([]);
  });
});

describe('cleanTitle', () => {
  // Titles as Tavily gave them on 2026-10-02.
  it('drops the site’s own name from the end', () => {
    expect(cleanTitle('Classic Banana Bread Recipe (One Bowl) | The Kitchn', site('thekitchn.com'))).toBe('Classic Banana Bread Recipe (One Bowl)');
    expect(cleanTitle('Banana Bread Recipe - Love and Lemons', site('loveandlemons.com'))).toBe('Banana Bread Recipe');
    expect(cleanTitle("My Favorite Banana Bread Recipe - Sally's Baking", site('sallysbakingaddiction.com'))).toBe('My Favorite Banana Bread Recipe');
    expect(cleanTitle('Classic lasagne recipe | Good Food', site('bbcgoodfood.com'))).toBe('Classic lasagne recipe');
    expect(cleanTitle('Mary Berry’s lasagne recipe - BBC Food', site('bbc.co.uk'))).toBe('Mary Berry’s lasagne recipe');
    expect(cleanTitle('One Pot Lasagna - with layers! - RecipeTin Eats', site('recipetineats.com'))).toBe('One Pot Lasagna - with layers!');
  });

  it('knows the Hebrew sites’ names, and drops Mako’s "מתכון:" label', () => {
    expect(cleanTitle('עוגת מוס שוקולד - מתכון קל ומומלץ ביותר! - מתכונים ב-10 דקות', site('10dakot.co.il'))).toBe('עוגת מוס שוקולד - מתכון קל ומומלץ ביותר!');
    expect(cleanTitle('מרק עוף אסייאתי - וואלה אוכל', site('food.walla.co.il'))).toBe('מרק עוף אסייאתי');
    expect(cleanTitle('מתכון: שקשוקה טריפוליטאית', site('mako.co.il'))).toBe('שקשוקה טריפוליטאית');
  });

  it('keeps an ending that is not the site, such as the cook or a subtitle', () => {
    expect(cleanTitle('The Ultimate Lasagna Recipe | Tyler Florence', site('foodnetwork.com'))).toBe('The Ultimate Lasagna Recipe | Tyler Florence');
    expect(cleanTitle('Best Banana Nut Bread Recipe - How To Make Banana Nut Bread', site('delish.com'))).toBe('Best Banana Nut Bread Recipe - How To Make Banana Nut Bread');
    expect(cleanTitle('שקשוקה חריפה עם פלפל צ\'ילי ועגבניות טריות | חנושה', site('mako.co.il'))).toBe('שקשוקה חריפה עם פלפל צ\'ילי ועגבניות טריות | חנושה');
  });
});

describe('createSearchHandler', () => {
  it('asks Tavily with the key, the sites for the language and "recipe" added', async () => {
    const fetchMock = tavily([{ url: 'https://www.recipetineats.com/chicken-chasseur/', title: 'Chicken Chasseur', content: 'A French chicken stew.' }]);
    const response = await createSearchHandler({ apiKey: KEY, fetch: fetchMock })(get('  chicken   chasseur '));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=600');
    expect(await response.json()).toEqual({
      results: [{ url: 'https://www.recipetineats.com/chicken-chasseur/', site: 'recipetineats.com', title: 'Chicken Chasseur' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'chicken chasseur recipe',
      search_depth: 'basic',
      max_results: 20,
      include_domains: ENGLISH_SITES.map((site) => site.domain),
      include_images: true,
    });
  });

  it('searches the Hebrew sites for a Hebrew query', async () => {
    const fetchMock = tavily([{ url: 'https://food.walla.co.il/recipe/652998', title: 'שוקי עוף עם בורגול' }]);
    const response = await createSearchHandler({ apiKey: KEY, fetch: fetchMock })(get('עוף עם בורגול'));
    expect(await response.json()).toEqual({ results: [{ url: 'https://food.walla.co.il/recipe/652998', site: 'food.walla.co.il', title: 'שוקי עוף עם בורגול' }] });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.query).toBe('מתכון עוף עם בורגול');
    expect(body.include_domains).toEqual(HEBREW_SITES.map((site) => site.domain));
  });

  it('answers not-configured without a key, and asks nobody', async () => {
    const fetchMock = tavily();
    for (const apiKey of [undefined, '', '  ']) {
      const response = await createSearchHandler({ apiKey, fetch: fetchMock })(get('soup'));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'not-configured' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an empty or overlong query, and other methods', async () => {
    const fetchMock = tavily();
    const handler = createSearchHandler({ apiKey: KEY, fetch: fetchMock });
    for (const request of [get(''), get('   '), get('x'.repeat(201)), new Request('http://localhost/api/search')]) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid-query' });
    }
    expect((await handler(new Request('http://localhost/api/search?q=soup', { method: 'POST', body: '{}' }))).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps what Tavily answers to its own errors, without passing the key on', async () => {
    const cases: [number, string, number][] = [
      [401, 'not-configured', 503],
      [403, 'not-configured', 503],
      [429, 'limit', 429],
      [432, 'limit', 429],
      [433, 'limit', 429],
      [400, 'search-failed', 502],
      [500, 'search-failed', 502],
    ];
    for (const [upstream, error, status] of cases) {
      const response = await createSearchHandler({ apiKey: KEY, fetch: tavily([], upstream) })(get('soup'));
      expect(response.status).toBe(status);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error });
      expect(text).not.toContain(KEY);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('reports a network failure and a body that is not JSON as search-failed', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const response = await createSearchHandler({ apiKey: KEY, fetch: down })(get('soup'));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'search-failed' });

    const garbled = vi.fn(async () => new Response('<html>', { status: 200 }));
    expect((await createSearchHandler({ apiKey: KEY, fetch: garbled })(get('soup'))).status).toBe(502);
  });

  it('gives up after the time limit', async () => {
    const stuck = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const response = await createSearchHandler({ apiKey: KEY, fetch: stuck, timeoutMs: 20 })(get('soup'));
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'timeout' });
  });
});

describe('the site lists', () => {
  it('never list a site that refuses our fetch: AI cannot read a page we cannot fetch', () => {
    const refusing = ['allrecipes.com', 'seriouseats.com', 'simplyrecipes.com', 'eatingwell.com', 'tasteofhome.com'];
    const listed = [...ENGLISH_SITES, ...HEBREW_SITES].map((entry) => entry.domain);
    for (const domain of refusing) expect(listed).not.toContain(domain);
  });

  it('ask Tavily for links only, never for page text', async () => {
    const fetch = tavily([]);
    await createSearchHandler({ apiKey: KEY, fetch })(get('soup'));
    const body = JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('include_raw_content');
  });
});
