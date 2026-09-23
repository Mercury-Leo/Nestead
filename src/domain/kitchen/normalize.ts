import { CATALOG } from './catalog';

/**
 * Turning free text ("2 bone-in, skin-on chicken thighs") into a catalog id
 * ("chicken-thighs"). Both sides go through the same normalisation, so an alias
 * only has to be written the way a person would write it.
 */

/** Words that describe how an ingredient is prepared, not what it is. */
const DESCRIPTORS = new Set([
  'fresh',
  'freshly',
  'chopped',
  'finely',
  'roughly',
  'coarsely',
  'thinly',
  'grated',
  'minced',
  'diced',
  'sliced',
  'large',
  'small',
  'medium',
  'bone-in',
  'skin-on',
  'boneless',
  'skinless',
  'ripe',
  'peeled',
  'trimmed',
  'halved',
  'quartered',
  'dried',
  'fine',
  'organic',
  'good-quality',
  'hot',
  'softened',
  'melted',
  'room-temperature',
  'shredded',
  'torn',
  'rinsed',
  'drained',
  'smashed',
  'packed',
  'heaped',
  'level',
  'about',
  'extra',
]);

/** Words that end in s but are not plurals. */
const NOT_PLURAL = new Set([
  'hummus',
  'couscous',
  'asparagus',
  'molasses',
  'swiss',
  'brussels',
  'harissa',
  'citrus',
  'bulgus',
  'lemongrass',
  'watercress',
  'grass',
  'chives',
  'oats',
  'jus',
  'bass',
  'glass',
  'is',
  'has',
  'was',
  'this',
  'less',
]);

const IRREGULAR: Record<string, string> = {
  leaves: 'leaf',
  halves: 'half',
  loaves: 'loaf',
  knives: 'knife',
  anchovies: 'anchovy',
  potatoes: 'potato',
  tomatoes: 'tomato',
  mangoes: 'mango',
  radishes: 'radish',
  peaches: 'peach',
  sandwiches: 'sandwich',
  dishes: 'dish',
  boxes: 'box',
  cheeses: 'cheese',
};

export function singularize(word: string): string {
  if (word.length <= 3 || NOT_PLURAL.has(word)) return word;
  const irregular = IRREGULAR[word];
  if (irregular !== undefined) return irregular;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('ss') || word.endsWith('us') || word.endsWith('is')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** Lower case, no accents, no brackets or punctuation, no descriptors, singular. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '' && word !== '-' && !DESCRIPTORS.has(word))
    .map(singularize)
    .join(' ');
}

let index: Map<string, string> | null = null;

/** normalised phrase -> catalog id. Names win over aliases, earlier over later. */
function phraseIndex(): Map<string, string> {
  if (index !== null) return index;
  const built = new Map<string, string>();
  for (const item of CATALOG) {
    const key = normalizeText(item.name);
    if (!built.has(key)) built.set(key, item.id);
  }
  for (const item of CATALOG) {
    for (const alias of item.aliases) {
      const key = normalizeText(alias);
      if (key !== '' && !built.has(key)) built.set(key, item.id);
    }
  }
  index = built;
  return built;
}

/**
 * The catalog id for a piece of ingredient text, or undefined.
 *
 * Tries the whole phrase, then shorter and shorter runs of words. At each
 * length the rightmost run wins, because English puts the noun last: "chicken
 * stock" is stock, not chicken.
 */
export function canonicalId(text: string): string | undefined {
  const normalized = normalizeText(text);
  if (normalized === '') return undefined;
  const lookup = phraseIndex();

  const whole = lookup.get(normalized);
  if (whole !== undefined) return whole;

  const words = normalized.split(' ');
  for (let length = words.length - 1; length >= 1; length -= 1) {
    for (let start = words.length - length; start >= 0; start -= 1) {
      const hit = lookup.get(words.slice(start, start + length).join(' '));
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/** The catalog id whose name or alias is exactly this text, without guessing. */
export function exactCatalogId(text: string): string | undefined {
  return phraseIndex().get(normalizeText(text));
}

/** True when `phrase` appears in `text` as whole words, after normalising both. */
export function containsPhrase(text: string, phrase: string): boolean {
  const haystack = ` ${normalizeText(text)} `;
  const needle = normalizeText(phrase);
  return needle !== '' && haystack.includes(` ${needle} `);
}
