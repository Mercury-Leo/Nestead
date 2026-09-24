import type { AnyRecipe, IngredientLine, ListItem, ListPart, NewRow, StoreSection, Unit } from '../types';
import { catalogFor } from './calories';
import { catalogItem } from './catalog';
import { lineKey, lineStatus } from './fit';
import type { PantryIndex } from './fit';
import { canonicalId, exactCatalogId } from './normalize';
import { formatAmount } from './quantity';

/**
 * The shopping list. It is split into groups by where things are bought:
 * Supermarket, where recipes put their groceries; General, for everything
 * else; and any groups the family adds (ListGroup rows).
 *
 * Only a recipe's missing lines go on it, merged across recipes by
 * ingredient. Adding a recipe again replaces its share rather than doubling it.
 *
 * Planning functions are pure: they return the writes to make, and the caller
 * makes them through the store.
 */

export const SUPERMARKET = 'supermarket';
export const GENERAL = 'general';

export const BUILT_IN_GROUPS: readonly { id: string; name: string }[] = [
  { id: SUPERMARKET, name: 'Supermarket' },
  { id: GENERAL, name: 'General' },
];

export function groupOf(item: Pick<ListItem, 'groupId'>): string {
  return item.groupId ?? SUPERMARKET;
}

/**
 * Food, so it belongs in the pantry once bought: anything from the
 * supermarket, from a recipe, or that the catalog knows. Batteries are not.
 */
export function isGrocery(item: Pick<ListItem, 'groupId' | 'canonicalId' | 'parts'>): boolean {
  return groupOf(item) === SUPERMARKET || item.canonicalId !== undefined || item.parts.length > 0;
}

export interface ListPlan {
  create: NewRow<ListItem>[];
  update: { id: string; patch: Partial<NewRow<ListItem>> }[];
  remove: string[];
}

export function itemKey(item: Pick<ListItem, 'canonicalId' | 'name'>): string {
  return item.canonicalId ?? `name:${item.name.toLowerCase()}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sectionFor(line: IngredientLine): StoreSection {
  return catalogFor(line)?.section ?? 'Other';
}

function listKeyFor(line: IngredientLine): string {
  const key = lineKey(line);
  return key.startsWith('name:') ? `name:${line.item.toLowerCase()}` : key;
}

/** Take a recipe's parts off every item, dropping items left with none. */
function withoutRecipe(items: readonly ListItem[], recipeId: string): { kept: Map<string, ListPart[]>; plan: ListPlan } {
  const kept = new Map<string, ListPart[]>();
  const plan: ListPlan = { create: [], update: [], remove: [] };
  for (const item of items) {
    const parts = item.parts.filter((part) => part.recipeId !== recipeId);
    kept.set(item.id, parts);
    if (parts.length === item.parts.length) continue;
    // Something added by hand was wanted anyway, so it stays.
    if (parts.length === 0 && item.manual !== true) plan.remove.push(item.id);
    else plan.update.push({ id: item.id, patch: { parts } });
  }
  return { kept, plan };
}

export function planRemoveRecipe(items: readonly ListItem[], recipeId: string): ListPlan {
  return withoutRecipe(items, recipeId).plan;
}

/**
 * @param servings The servings chosen on the recipe page; quantities follow it.
 */
export function planAddRecipe(
  items: readonly ListItem[],
  recipe: Pick<AnyRecipe, 'id' | 'title' | 'servings' | 'ingredients'>,
  servings: number,
  pantry: PantryIndex,
): ListPlan {
  const { kept, plan } = withoutRecipe(items, recipe.id);
  const factor = servings / Math.max(1, recipe.servings);
  // An item that lost its only part is removed unless this recipe puts
  // something back on it: re-adding keeps the row (and who checked it).
  const removed = new Set(plan.remove);
  const updates = new Map(plan.update.map((entry) => [entry.id, entry]));

  const byKey = new Map(items.map((item) => [itemKey(item), item]));
  const created = new Map<string, NewRow<ListItem>>();

  for (const line of recipe.ingredients) {
    if (lineStatus(line, pantry) !== 'missing') continue;
    const part: ListPart = {
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      qty: line.qty === null ? null : line.qty * factor,
      unit: line.unit,
    };
    const key = listKeyFor(line);

    const existing = byKey.get(key);
    if (existing !== undefined) {
      const parts = [...(updates.get(existing.id)?.patch.parts ?? kept.get(existing.id) ?? []), part];
      const patch: Partial<NewRow<ListItem>> = { parts };
      // Something new to buy on an item you had ticked off: untick it.
      const wanted = (kept.get(existing.id)?.length ?? 0) > 0 || existing.manual === true;
      if (!removed.has(existing.id) && wanted) patch.checked = false;
      removed.delete(existing.id);
      updates.set(existing.id, { id: existing.id, patch });
      continue;
    }

    const pending = created.get(key);
    if (pending !== undefined) {
      pending.parts.push(part);
      continue;
    }

    const item = catalogFor(line);
    const row: NewRow<ListItem> = {
      name: capitalise(line.item),
      section: sectionFor(line),
      groupId: SUPERMARKET,
      parts: [part],
      checked: false,
    };
    if (item !== undefined) row.canonicalId = item.id;
    created.set(key, row);
  }

  return { create: [...created.values()], update: [...updates.values()], remove: [...removed] };
}

/**
 * Things typed into a group by hand. Already in that group means untick it
 * rather than add it twice. In Supermarket the catalog is asked loosely, so
 * the item lands in its aisle and merges with what recipes need; elsewhere
 * only an exact name counts, so "egg cups" is not taken for eggs.
 */
export function planAddOwn(items: readonly ListItem[], names: readonly string[], groupId: string): ListPlan {
  const plan: ListPlan = { create: [], update: [], remove: [] };
  const inGroup = new Map(items.filter((item) => groupOf(item) === groupId).map((item) => [itemKey(item), item]));
  const seen = new Set<string>();

  for (const raw of names) {
    const name = capitalise(raw.trim());
    if (name === '') continue;
    const id = groupId === SUPERMARKET ? canonicalId(name) : exactCatalogId(name);
    const key = itemKey({ canonicalId: id, name });
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = inGroup.get(key);
    if (existing !== undefined) {
      if (existing.checked || existing.manual !== true) plan.update.push({ id: existing.id, patch: { checked: false, manual: true } });
      continue;
    }
    const row: NewRow<ListItem> = {
      name,
      section: catalogItem(id)?.section ?? 'Other',
      groupId,
      parts: [],
      manual: true,
      checked: false,
    };
    if (id !== undefined) row.canonicalId = id;
    plan.create.push(row);
  }
  return plan;
}

/** A group is going: what was in it moves to General rather than vanishing. */
export function planRemoveGroup(items: readonly ListItem[], groupId: string): ListPlan {
  return {
    create: [],
    update: items.filter((item) => groupOf(item) === groupId).map((item) => ({ id: item.id, patch: { groupId: GENERAL } })),
    remove: [],
  };
}

/* ------------------------------------------------------------- display -- */

type Family = 'mass' | 'volume' | 'spoon';

const FAMILY: Partial<Record<Exclude<Unit, null>, { family: Family; factor: number }>> = {
  g: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  tsp: { family: 'spoon', factor: 1 },
  tbsp: { family: 'spoon', factor: 3 },
  cup: { family: 'spoon', factor: 48 },
};

function familyAmount(family: Family, base: number): string {
  if (family === 'mass') return base >= 1000 ? formatAmount(base / 1000, 'kg') : formatAmount(base, 'g');
  if (family === 'volume') return base >= 1000 ? formatAmount(base / 1000, 'l') : formatAmount(base, 'ml');
  if (base >= 48) return formatAmount(base / 48, 'cup');
  if (base >= 3) return formatAmount(base / 3, 'tbsp');
  return formatAmount(base, 'tsp');
}

/** "200 g", "1 kg", or "200 g + 1 cup" when units cannot be added up. */
export function formatListQty(parts: readonly ListPart[]): string {
  const families = new Map<Family, number>();
  const others = new Map<string, number>();
  const order: string[] = [];

  for (const part of parts) {
    if (part.qty === null) continue;
    const family = part.unit === null ? undefined : FAMILY[part.unit];
    const key = family?.family ?? `unit:${part.unit ?? ''}`;
    if (!order.includes(key)) order.push(key);
    if (family !== undefined) {
      families.set(family.family, (families.get(family.family) ?? 0) + part.qty * family.factor);
    } else {
      others.set(key, (others.get(key) ?? 0) + part.qty);
    }
  }

  return order
    .map((key) => {
      if (key.startsWith('unit:')) {
        const unit = key.slice(5) === '' ? null : (key.slice(5) as Unit);
        return formatAmount(others.get(key) as number, unit);
      }
      return familyAmount(key as Family, families.get(key as Family) as number);
    })
    .join(' + ');
}

export interface ListRecipe {
  recipeId: string;
  title: string;
  count: number;
}

/** The recipes that put something on the list, in the order they first appear. */
export function recipesOnList(items: readonly ListItem[]): ListRecipe[] {
  const found = new Map<string, ListRecipe>();
  for (const item of items) {
    for (const part of item.parts) {
      const entry = found.get(part.recipeId) ?? { recipeId: part.recipeId, title: part.recipeTitle, count: 0 };
      entry.count += 1;
      found.set(part.recipeId, entry);
    }
  }
  return [...found.values()];
}

export interface LeftOff {
  pantry: string[];
  staples: string[];
}

/** The ingredients those recipes need that you already have, counted once each. */
export function leftOffList(recipes: readonly Pick<AnyRecipe, 'ingredients'>[], pantry: PantryIndex): LeftOff {
  const pantryNames = new Map<string, string>();
  const stapleNames = new Map<string, string>();
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      const status = lineStatus(line, pantry);
      const key = lineKey(line);
      const name = catalogFor(line)?.name ?? capitalise(line.item);
      if (status === 'have' && !pantryNames.has(key)) pantryNames.set(key, name);
      if (status === 'staple' && !stapleNames.has(key)) stapleNames.set(key, name);
    }
  }
  return { pantry: [...pantryNames.values()], staples: [...stapleNames.values()] };
}
