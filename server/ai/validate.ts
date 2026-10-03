import { RECIPE_SCHEMA, SERVING_UNITS } from './prompt';

/**
 * The model's answer, checked before anything uses it: exactly the schema's
 * keys, exact types, plain text, every limit. A failure rejects the whole
 * answer; nothing is repaired or cut to fit (spec section 5.5).
 */

export const LIMITS = {
  content: 40_000,
  title: 200,
  description: 1_000,
  servings: [1, 100],
  minutes: [0, 4_320],
  ingredients: 80,
  line: 300,
  steps: 60,
  step: 2_000,
} as const;

export interface Extracted {
  title: string;
  description?: string;
  servings?: number;
  servingUnit?: string;
  prepMin?: number;
  cookMin?: number;
  ingredients: string[];
  steps: string[];
}

export type Validated = { kind: 'recipe'; recipe: Extracted } | { kind: 'not-a-recipe' } | { kind: 'invalid'; reason: string };

const KEYS: readonly string[] = RECIPE_SCHEMA.required;
/** A tag: `<`, then a letter, `/` or `!`, through the first `>` (a `<` inside counts as part of it, so nothing left forms a tag). */
const TAG = /<[a-zA-Z/!][^>]*>/g;
// C0 and C1 controls (each field is one line, so newlines and tabs too) and bidi embedding, override and isolate marks.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/**
 * No tag can start after the last `>`, so only the text up to it is searched. That keeps
 * the search linear: otherwise every unclosed `<a` would scan on to the end, and 20,000
 * of them in a 40,000-character answer took over half a second.
 */
function stripTags(text: string): string {
  const end = text.lastIndexOf('>') + 1;
  return end === 0 ? text : text.slice(0, end).replace(TAG, ' ') + text.slice(end);
}

export function plainText(text: string): string {
  return stripTags(text).replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

function invalid(reason: string): Validated {
  return { kind: 'invalid', reason };
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
  return value >= min && value <= max;
}

export function validateOutput(content: string): Validated {
  if (content.length > LIMITS.content) return invalid('too long');
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return invalid('not JSON');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return invalid('not an object');
  const keys = Object.keys(data);
  if (keys.length !== KEYS.length || !KEYS.every((key) => keys.includes(key))) return invalid('keys');
  const o = data as Record<string, unknown>;

  if (typeof o.found !== 'boolean') return invalid('found');
  if (!o.found) return { kind: 'not-a-recipe' };
  if (typeof o.title !== 'string') return invalid('title');
  if (o.description !== null && typeof o.description !== 'string') return invalid('description');
  for (const key of ['servings', 'prepMin', 'cookMin'] as const) {
    if (o[key] !== null && !isInt(o[key])) return invalid(key);
  }
  if (o.servingUnit !== null && !(typeof o.servingUnit === 'string' && (SERVING_UNITS as readonly string[]).includes(o.servingUnit))) {
    return invalid('servingUnit');
  }
  if (!isStringList(o.ingredients)) return invalid('ingredients');
  if (!isStringList(o.steps)) return invalid('steps');

  const title = plainText(o.title);
  const ingredients = o.ingredients.map(plainText);
  if (title === '' || ingredients.length === 0) return { kind: 'not-a-recipe' };
  if (title.length > LIMITS.title) return invalid('title length');
  if (ingredients.length > LIMITS.ingredients || ingredients.some((line) => line === '' || line.length > LIMITS.line)) return invalid('ingredient lines');
  const steps = o.steps.map(plainText);
  if (steps.length > LIMITS.steps || steps.some((step) => step === '' || step.length > LIMITS.step)) return invalid('steps');
  const description = typeof o.description === 'string' ? plainText(o.description) : '';
  if (description.length > LIMITS.description) return invalid('description length');
  if (isInt(o.servings) && !inRange(o.servings, LIMITS.servings)) return invalid('servings range');
  if (isInt(o.prepMin) && !inRange(o.prepMin, LIMITS.minutes)) return invalid('prepMin range');
  if (isInt(o.cookMin) && !inRange(o.cookMin, LIMITS.minutes)) return invalid('cookMin range');

  const recipe: Extracted = { title, ingredients, steps };
  if (description !== '') recipe.description = description;
  if (isInt(o.servings)) recipe.servings = o.servings;
  if (typeof o.servingUnit === 'string') recipe.servingUnit = o.servingUnit;
  if (isInt(o.prepMin)) recipe.prepMin = o.prepMin;
  if (isInt(o.cookMin)) recipe.cookMin = o.cookMin;
  return { kind: 'recipe', recipe };
}
