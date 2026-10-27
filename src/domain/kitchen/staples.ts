import type { IngredientLine } from '../types';
import { canonicalId, normalizeText } from './normalize';

/**
 * The staples every kitchen has. A recipe's lines for these never go on the
 * shopping list; nothing else is known about what the family has.
 */

// i18n: matched against the English catalog, like the seed data; never shown as written.
export const STAPLES: readonly string[] = [
  'Water', 'Salt', 'Black pepper', 'Olive oil', 'Vegetable oil', 'Sugar', 'All-purpose flour', 'Baking soda',
];

/** How a line is matched: catalog id if known, else its words. */
function keyForText(text: string, known?: string): string {
  return known ?? canonicalId(text) ?? `name:${normalizeText(text)}`;
}

export function lineKey(line: IngredientLine): string {
  return keyForText(line.item, line.canonicalId);
}

const STAPLE_KEYS: ReadonlySet<string> = new Set(STAPLES.map((name) => keyForText(name)));

export function isStaple(line: IngredientLine): boolean {
  return STAPLE_KEYS.has(lineKey(line));
}

/** The lines that would go on the shopping list. */
export function toBuy<T extends IngredientLine>(lines: readonly T[]): T[] {
  return lines.filter((line) => !isStaple(line));
}
