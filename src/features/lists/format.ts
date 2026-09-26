import type { ListItem } from '../../domain/types';
import { formatList, i18n } from '../../i18n';

/** Wording for list rows. */

/** "for Shakshuka and Lemon Chicken", or null for something added by hand. */
export function forLine(item: ListItem): string | null {
  if (item.parts.length === 0) return null;
  return i18n.t('lists.forRecipes', { recipes: formatList([...new Set(item.parts.map((part) => part.recipeTitle))]) });
}
