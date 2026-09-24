import type { CustomDietRule, ListItem, NewRow, PantryItem, PresetId } from '../../../domain/types';
import { catalogFor } from '../../../domain/kitchen/calories';
import { GENERAL, SUPERMARKET } from '../../../domain/kitchen/list';
import { canonicalId } from '../../../domain/kitchen/normalize';

/** Pantry, staples, diet profile and shopping list for the demo family. */

export const SEED_HAVE: readonly string[] = [
  // Produce
  'Lemons', 'Yellow onions', 'Garlic', 'Carrots', 'Celery', 'Baby spinach', 'Cherry tomatoes',
  'Potatoes', 'Bananas', 'Sweet potatoes', 'Limes',
  // Dairy & eggs
  'Eggs', 'Butter', 'Parmesan', 'Milk',
  // Meat & fish
  'Chicken thighs', 'Salmon fillets',
  // Grains & pasta
  'Long-grain rice', 'Arborio rice', 'Brown lentils', 'Spaghetti', 'Rice noodles',
  // Cans & jars
  'Chicken stock', 'Vegetable stock', 'Crushed tomatoes', 'Black beans', 'Chickpeas', 'Coconut milk', 'Soy sauce',
  // Spices & dried herbs
  'Smoked paprika', 'Ground cumin', 'Dried oregano', 'Bay leaves', 'Cinnamon',
];

/** What every new family starts with, demo or not. */
export const DEFAULT_STAPLES: readonly string[] = [
  'Water', 'Salt', 'Black pepper', 'Olive oil', 'Vegetable oil', 'Sugar', 'All-purpose flour', 'Baking soda',
];

export function pantryRow(name: string, kind: PantryItem['kind']): NewRow<PantryItem> {
  const id = canonicalId(name);
  const line = { id: '', qty: null, unit: null, item: name, canonicalId: id };
  const row: NewRow<PantryItem> = { name, section: catalogFor(line)?.section ?? 'Other', kind };
  if (id !== undefined) row.canonicalId = id;
  return row;
}

export const SEED_PRESETS: Partial<Record<PresetId, boolean>> = { nutAllergy: true };

export const SEED_CUSTOM_RULES: readonly CustomDietRule[] = [
  {
    id: 'seed-sesame-allergy',
    label: 'Sesame allergy',
    terms: ['sesame', 'tahini', 'sesame paste', 'sesame oil', 'toasted sesame oil', 'sesame seeds', 'toasted sesame seeds'],
    hint: 'Also matches tahini and sesame oil',
  },
  {
    id: 'seed-no-cilantro',
    label: 'No cilantro',
    terms: ['cilantro', 'coriander leaves', 'coriander leaf', 'fresh coriander'],
    hint: 'Also matches coriander leaves',
  },
];

interface SeedListSpec {
  name: string;
  recipeId: string;
  recipeTitle: string;
  qty: number;
  unit: ListItem['parts'][number]['unit'];
  checked: boolean;
}

/** recipeIds here are the seed slugs; the seeder maps them to stored row ids. */
export const SEED_LIST: readonly SeedListSpec[] = [
  { name: 'Fresh dill', recipeId: 'one-pan-lemon-chicken-rice', recipeTitle: 'One-Pan Lemon Chicken & Rice', qty: 1, unit: 'bunch', checked: false },
  { name: 'Greek yogurt', recipeId: 'one-pan-lemon-chicken-rice', recipeTitle: 'One-Pan Lemon Chicken & Rice', qty: 200, unit: 'g', checked: false },
  { name: 'Baby bok choy', recipeId: 'miso-glazed-salmon-bok-choy', recipeTitle: 'Miso-Glazed Salmon & Bok Choy', qty: 4, unit: 'head', checked: false },
  { name: 'Scallions', recipeId: 'miso-glazed-salmon-bok-choy', recipeTitle: 'Miso-Glazed Salmon & Bok Choy', qty: 1, unit: 'bunch', checked: true },
  { name: 'White miso paste', recipeId: 'miso-glazed-salmon-bok-choy', recipeTitle: 'Miso-Glazed Salmon & Bok Choy', qty: 3, unit: 'tbsp', checked: false },
  { name: 'Feta', recipeId: 'shakshuka-with-feta', recipeTitle: 'Shakshuka with Feta', qty: 150, unit: 'g', checked: true },
];

/** Things the demo family added by hand, so General is not empty. */
export const SEED_OWN: readonly { name: string; groupId: string }[] = [
  { name: 'Bin bags', groupId: GENERAL },
  { name: 'AA batteries', groupId: GENERAL },
];

export function listRow(spec: SeedListSpec, recipeId: string): NewRow<ListItem> {
  const id = canonicalId(spec.name);
  const line = { id: '', qty: null, unit: null, item: spec.name, canonicalId: id };
  const row: NewRow<ListItem> = {
    name: spec.name,
    section: catalogFor(line)?.section ?? 'Other',
    groupId: SUPERMARKET,
    parts: [{ recipeId, recipeTitle: spec.recipeTitle, qty: spec.qty, unit: spec.unit }],
    checked: spec.checked,
  };
  if (id !== undefined) row.canonicalId = id;
  return row;
}
