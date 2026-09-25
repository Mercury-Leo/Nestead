import type { ImportedRecipe, ImportReport } from './types';

/** Reading a recipe out of HTML: schema.org JSON-LD first, microdata as the fallback. */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  deg: '°',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function clean(text: unknown): string {
  if (typeof text !== 'string') return '';
  return decodeEntities(text.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "PT1H15M" -> 75. */
export function isoMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(value.trim());
  if (match === null) return undefined;
  const [, d, h, m, s] = match;
  const minutes = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(m ?? 0) + Number(s ?? 0) / 60;
  return Number.isFinite(minutes) ? Math.round(minutes) : undefined;
}

function firstNumber(value: unknown): number | undefined {
  const text = Array.isArray(value) ? value.map(String).join(' ') : String(value ?? '');
  const match = /(\d+(?:\.\d+)?)/.exec(text);
  return match === null ? undefined : Number(match[1]);
}

function types(node: Record<string, unknown>): string[] {
  const type = node['@type'];
  return (Array.isArray(type) ? type : [type]).map(String);
}

/** Every Recipe object in a JSON-LD value: arrays, @graph and nesting. */
function findRecipes(value: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) findRecipes(item, found);
  } else if (value !== null && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (types(node).some((type) => type === 'Recipe' || type.endsWith('/Recipe'))) found.push(node);
    if (node['@graph'] !== undefined) findRecipes(node['@graph'], found);
    if (node.mainEntity !== undefined) findRecipes(node.mainEntity, found);
  }
  return found;
}

function imageOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return imageOf(value[0]);
  if (value !== null && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    return typeof node.url === 'string' ? node.url : typeof node.contentUrl === 'string' ? node.contentUrl : undefined;
  }
  return undefined;
}

function instructions(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/\n+|(?<=\.)\s{2,}/)
      .map(clean)
      .filter((step) => step !== '');
  }
  if (Array.isArray(value)) return value.flatMap(instructions);
  if (value !== null && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (types(node).includes('HowToSection')) return instructions(node.itemListElement);
    const text = clean(node.text ?? node.name);
    return text === '' ? [] : [text];
  }
  return [];
}

function tools(value: unknown): string[] {
  if (typeof value === 'string') return [clean(value)].filter((t) => t !== '');
  if (Array.isArray(value)) return value.flatMap(tools);
  if (value !== null && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    return tools(node.name ?? node.text);
  }
  return [];
}

const EQUIPMENT_WORDS = [
  'dutch oven',
  'sheet pan',
  'baking sheet',
  'baking dish',
  'roasting tin',
  'roasting pan',
  'loaf tin',
  'loaf pan',
  'cake tin',
  'grill pan',
  'frying pan',
  'skillet',
  'saucepan',
  'stockpot',
  'wok',
  'mixing bowl',
  'food processor',
  'blender',
  'stand mixer',
  'slow cooker',
  'pressure cooker',
  'colander',
  'sieve',
  'whisk',
  'rolling pin',
];
const ADJECTIVES = '(?:large|small|medium|big|deep|shallow|heavy|wide|oven-safe|ovenproof|non-stick|nonstick|cast-iron|\\d+\\s?cm)';

/** When a page lists no tools, find them in the instructions. */
export function detectEquipment(steps: readonly string[]): string[] {
  const text = steps.join(' ');
  const found: string[] = [];
  for (const word of EQUIPMENT_WORDS) {
    const match = new RegExp(`((?:${ADJECTIVES}\\s+){0,3})${word.replace(' ', '\\s+')}\\b`, 'i').exec(text);
    if (match === null) continue;
    const phrase = match[0].replace(/\s+/g, ' ').trim();
    const name = phrase.charAt(0).toUpperCase() + phrase.slice(1).toLowerCase();
    if (!found.some((existing) => existing.toLowerCase().includes(word))) found.push(name);
  }
  return found;
}

function fromJsonLd(html: string): Record<string, unknown> | undefined {
  const blocks = html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    const body = (block[1] ?? '').trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try {
      const recipes = findRecipes(JSON.parse(body));
      if (recipes[0] !== undefined) return recipes[0];
    } catch {
      // A broken block is skipped; another may be fine.
    }
  }
  return undefined;
}

/** A minimal microdata reader: itemprop values inside the Recipe scope. */
function fromMicrodata(html: string): Record<string, unknown> | undefined {
  const start = html.search(/itemtype\s*=\s*["']https?:\/\/schema\.org\/Recipe["']/i);
  if (start === -1) return undefined;
  const scope = html.slice(start);
  const values = (prop: string): string[] => {
    const out: string[] = [];
    const tag = new RegExp(`<([a-z0-9]+)\\b([^>]*\\bitemprop\\s*=\\s*["'][^"']*\\b${prop}\\b[^"']*["'][^>]*)>`, 'gi');
    for (const match of scope.matchAll(tag)) {
      const attrs = match[2] ?? '';
      const content = /\b(?:content|datetime|src|href)\s*=\s*["']([^"']*)["']/i.exec(attrs);
      if (content !== null) {
        out.push(clean(content[1]));
        continue;
      }
      const name = match[1] ?? '';
      const after = scope.slice((match.index ?? 0) + match[0].length);
      const end = after.search(new RegExp(`</${name}>`, 'i'));
      out.push(clean(end === -1 ? after.slice(0, 500) : after.slice(0, end)));
    }
    return out.filter((value) => value !== '');
  };
  const name = values('name')[0];
  if (name === undefined) return undefined;
  return {
    '@type': 'Recipe',
    name,
    description: values('description')[0],
    image: values('image')[0],
    recipeYield: values('recipeYield')[0],
    prepTime: values('prepTime')[0],
    cookTime: values('cookTime')[0],
    totalTime: values('totalTime')[0],
    recipeIngredient: [...values('recipeIngredient'), ...values('ingredients')],
    recipeInstructions: values('recipeInstructions'),
    nutrition: { calories: values('calories')[0] },
    aggregateRating: { ratingValue: values('ratingValue')[0] },
  };
}

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function parseRecipeHtml(html: string, url: string): { recipe: ImportedRecipe; report: ImportReport } | null {
  const node = fromJsonLd(html) ?? fromMicrodata(html);
  if (node === undefined) return null;

  const title = clean(node.name);
  const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : Array.isArray(node.ingredients) ? node.ingredients : [])
    .map(clean)
    .filter((line: string) => line !== '');
  const steps = instructions(node.recipeInstructions);
  if (title === '' || ingredients.length === 0) return null;

  const recipe: ImportedRecipe = { url, site: siteOf(url), title, ingredients, steps, equipment: [] };
  const description = clean(node.description);
  if (description !== '') recipe.description = description;
  const image = imageOf(node.image);
  if (image !== undefined) recipe.image = new URL(image, url).toString();

  const yieldText = Array.isArray(node.recipeYield) ? node.recipeYield.map(String) : [String(node.recipeYield ?? '')];
  const servings = firstNumber(yieldText);
  if (servings !== undefined && servings > 0) {
    recipe.servings = Math.round(servings);
    const unit = /\d+\s*(slices?|pieces?|cookies?|muffins?|bars?|squares?)\b/i.exec(yieldText.join(' '));
    if (unit !== null) recipe.servingUnit = (unit[1] as string).toLowerCase().replace(/s$/, '');
  }

  const prep = isoMinutes(node.prepTime);
  const cook = isoMinutes(node.cookTime);
  const total = isoMinutes(node.totalTime);
  if (prep !== undefined) recipe.prepMin = prep;
  if (cook !== undefined) recipe.cookMin = cook;
  else if (total !== undefined) recipe.cookMin = Math.max(0, total - (prep ?? 0));

  const nutrition = node.nutrition as Record<string, unknown> | undefined;
  const kcal = firstNumber(nutrition?.calories);
  if (kcal !== undefined && kcal > 0) recipe.kcal = Math.round(kcal);
  const rating = firstNumber((node.aggregateRating as Record<string, unknown> | undefined)?.ratingValue);
  if (rating !== undefined && rating > 0 && rating <= 5) recipe.rating = Math.round(rating * 10) / 10;

  const listed = tools(node.tool);
  recipe.equipment = listed.length > 0 ? listed : detectEquipment(steps);

  const found: string[] = ['title', ...(image !== undefined ? ['photo'] : []), ...(servings !== undefined ? ['servings'] : [])];
  const missing: string[] = [];
  if (image === undefined) missing.push('photo');
  if (servings === undefined) missing.push('servings');
  if (prep === undefined && cook === undefined && total === undefined) missing.push('times');
  if (recipe.kcal === undefined) missing.push('calories');
  if (steps.length === 0) missing.push('steps');
  return { recipe, report: { found, missing } };
}
