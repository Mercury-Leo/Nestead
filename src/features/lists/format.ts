import type { ListItem } from '../../domain/types';

/** Wording for list rows. */

export function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "for Shakshuka and Lemon Chicken", or null for something added by hand. */
export function forLine(item: ListItem): string | null {
  if (item.parts.length === 0) return null;
  return `for ${listJoin([...new Set(item.parts.map((part) => part.recipeTitle))])}`;
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
