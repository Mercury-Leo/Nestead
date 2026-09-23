import type { AnyRecipe, IngredientLine, PantryItem } from '../types';
import { canonicalId, normalizeText } from './normalize';

/**
 * Pantry fit: which of a recipe's lines you already have, which are staples,
 * and which you would have to buy.
 */

export type LineStatus = 'have' | 'staple' | 'missing';

/** Water is in every kitchen, whether or not anyone listed it. */
const ALWAYS_STAPLE = 'water';

/** How a line or pantry item is matched: catalog id if known, else its words. */
export function keyForText(text: string, known?: string): string {
  return known ?? canonicalId(text) ?? `name:${normalizeText(text)}`;
}

export function lineKey(line: IngredientLine): string {
  return keyForText(line.item, line.canonicalId);
}

export interface PantryIndex {
  have: ReadonlySet<string>;
  staples: ReadonlySet<string>;
  haveCount: number;
  stapleCount: number;
}

export function pantryIndex(items: readonly PantryItem[]): PantryIndex {
  const have = new Set<string>();
  const staples = new Set<string>([ALWAYS_STAPLE]);
  let haveCount = 0;
  let stapleCount = 0;
  for (const item of items) {
    const key = keyForText(item.name, item.canonicalId);
    if (item.kind === 'staple') {
      staples.add(key);
      stapleCount += 1;
    } else {
      have.add(key);
      haveCount += 1;
    }
  }
  return { have, staples, haveCount, stapleCount };
}

export interface PantryFit {
  status: Record<string, LineStatus>;
  have: number;
  staple: number;
  missing: number;
  total: number;
  /** (have + staple) / total; 1 for a recipe with no ingredients. */
  ratio: number;
  missingLines: IngredientLine[];
}

export function lineStatus(line: IngredientLine, index: PantryIndex): LineStatus {
  const key = lineKey(line);
  // Staples win: something you always have never counts as pantry stock.
  if (index.staples.has(key)) return 'staple';
  if (index.have.has(key)) return 'have';
  return 'missing';
}

export function pantryFit(recipe: Pick<AnyRecipe, 'ingredients'>, index: PantryIndex): PantryFit {
  const status: Record<string, LineStatus> = {};
  let have = 0;
  let staple = 0;
  const missingLines: IngredientLine[] = [];

  for (const line of recipe.ingredients) {
    const result = lineStatus(line, index);
    status[line.id] = result;
    if (result === 'have') have += 1;
    else if (result === 'staple') staple += 1;
    else missingLines.push(line);
  }

  const total = recipe.ingredients.length;
  return {
    status,
    have,
    staple,
    missing: missingLines.length,
    total,
    ratio: total === 0 ? 1 : (have + staple) / total,
    missingLines,
  };
}
