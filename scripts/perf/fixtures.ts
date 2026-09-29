import type { BoardColumn, IngredientLine, ListGroup, ListItem, NewRow, PantryItem, Recipe, Task } from '../../src/domain/types';
import { CATALOG } from '../../src/domain/kitchen/catalog';
import { catalogFor } from '../../src/domain/kitchen/calories';
import { GENERAL, SUPERMARKET } from '../../src/domain/kitchen/list';
import { canonicalId } from '../../src/domain/kitchen/normalize';
import { pantryRow } from '../../src/domain/kitchen/pantry';
import { buildRecipe } from '../../src/features/larder/seed/build';
import { SEED_LIBRARY } from '../../src/features/larder/seed/recipes';
import { DEFAULT_STAPLES } from '../../src/features/larder/setup';

/**
 * Rows for the measurements: a typical family and a heavy one. The heavy set
 * extends the typical one, so growing from one to the other is an insert.
 * Recipes are the demo library's, cycled, so their ingredient and step jsonb
 * is as big as real recipes' is.
 */

export interface Size {
  tasks: number;
  recipes: number;
  photos: number;
  pantry: number;
  listItems: number;
}

export const SIZES: Record<'typical' | 'heavy', Size> = {
  typical: { tasks: 40, recipes: 25, photos: 0, pantry: 30, listItems: 40 },
  heavy: { tasks: 300, recipes: 150, photos: 30, pantry: 120, listItems: 200 },
};

export const COLUMNS: NewRow<BoardColumn>[] = [
  { name: 'To do', position: 1000, isDone: false },
  { name: 'Doing', position: 2000, isDone: false },
  { name: 'Done', position: 3000, isDone: true },
];

export const GROUPS: NewRow<ListGroup>[] = [
  { name: 'Chemist', position: 3000 },
  { name: 'Hardware', position: 4000 },
];

const CHORES = [
  'Take the bins out', 'Hoover the stairs', 'Water the plants', 'Feed the cat', 'Wash up', 'Clean the bathroom',
  'Change the beds', 'Mow the lawn', 'Pay the council tax', 'Book the dentist', 'Fix the leaky tap',
  'Sort the recycling', 'Walk the dog', 'Iron school shirts', 'Defrost the freezer', 'Clean the oven',
  'Renew the car insurance', 'Order school shoes', 'Descale the kettle', 'Wipe the windows',
];
const ICONS = ['🗑️', '🧹', '🪴', '🐱', '🍽️', '🛁', '🛏️', '🌱', '💷', '🦷'];

export function taskRows(from: number, to: number, columns: readonly BoardColumn[], memberId: string): NewRow<Task>[] {
  const rows: NewRow<Task>[] = [];
  for (let i = from; i < to; i += 1) {
    const column = columns[i % columns.length]!;
    const row: NewRow<Task> = {
      title: `${CHORES[i % CHORES.length]} #${i + 1}`,
      columnId: column.id,
      position: (Math.floor(i / columns.length) + 1) * 1000,
      done: column.isDone,
    };
    if (i % 2 === 0) row.icon = ICONS[i % ICONS.length]!;
    if (i % 3 === 0) row.assigneeId = memberId;
    if (i % 4 === 0) row.description = 'Check the cupboard under the sink first; the spare bags are behind the bleach.';
    if (i % 5 === 0) row.dueDate = `2026-10-${String((i % 28) + 1).padStart(2, '0')}`;
    if (i % 7 === 0) {
      row.dueDate ??= '2026-10-01';
      row.recurEveryDays = 7;
      row.recurFrom = row.dueDate;
    }
    rows.push(row);
  }
  return rows;
}

export function recipeRows(from: number, to: number, memberId: string): NewRow<Recipe>[] {
  const rows: NewRow<Recipe>[] = [];
  for (let i = from; i < to; i += 1) {
    const { id: _slug, inLibrary: _inLibrary, ...content } = SEED_LIBRARY[i % SEED_LIBRARY.length]!;
    rows.push({ ...content, title: `${content.title} ${Math.floor(i / SEED_LIBRARY.length) + 1}`, createdBy: memberId });
  }
  return rows;
}

/** Twelve things no seeded list item or pantry row has, so adding it to the list creates twelve rows. */
export const TWELVE = (() => {
  const { id: _slug, inLibrary: _inLibrary, ...content } = buildRecipe({
    slug: 'perf-twelve',
    title: 'Perf: twelve-ingredient laksa',
    source: 'mine',
    servings: 4,
    prepMin: 20,
    cookMin: 30,
    tags: [],
    ingredients: [
      '2 star anise', '6 cardamom pods', '1 pinch saffron', '2 stalks lemongrass', '400 ml coconut milk',
      '2 tbsp fish sauce', '1 tbsp tamarind paste', '200 g rice noodles', '1 bunch Thai basil',
      '4 makrut lime leaves', '1 tbsp palm sugar', '100 g beansprouts',
    ],
    equipment: ['Wok'],
    steps: ['Simmer the paste, add the milk, then the noodles.'],
  });
  return content as NewRow<Recipe>;
})();

const keyOf = (name: string, id?: string): string => id ?? canonicalId(name) ?? name.toLowerCase();
const TWELVE_KEYS = new Set(TWELVE.ingredients.map((line) => keyOf(line.item, line.canonicalId)));

export function pantryRows(from: number, to: number): NewRow<PantryItem>[] {
  const staples = new Set(DEFAULT_STAPLES.map((name) => keyOf(name)));
  const have = CATALOG.map((item) => item.name).filter((name) => !TWELVE_KEYS.has(keyOf(name)) && !staples.has(keyOf(name)));
  const rows: NewRow<PantryItem>[] = [];
  for (let i = from; i < to; i += 1) {
    if (i < DEFAULT_STAPLES.length) {
      rows.push(pantryRow(DEFAULT_STAPLES[i]!, 'staple'));
    } else {
      const name = have[(i - DEFAULT_STAPLES.length) % have.length]!;
      rows.push(pantryRow(name.charAt(0).toUpperCase() + name.slice(1), 'have'));
    }
  }
  return rows;
}

const HOUSEHOLD = ['Batteries', 'Light bulbs', 'Toothpaste', 'Bin bags', 'Washing-up liquid', 'Plasters', 'Sponges', 'Screws', 'Kitchen roll', 'Shampoo'];

/**
 * Grocery rows from the seeded recipes' own ingredients (one per item, like
 * the app keeps them), then hand-added household things once those run out.
 */
export function listRows(
  from: number,
  to: number,
  recipes: ReadonlyArray<{ id: string; title: string; ingredients: IngredientLine[] }>,
  groupIds: readonly string[],
): NewRow<ListItem>[] {
  const pool: NewRow<ListItem>[] = [];
  const seen = new Set<string>(TWELVE_KEYS);
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      const key = keyOf(line.item, line.canonicalId);
      if (seen.has(key)) continue;
      seen.add(key);
      const row: NewRow<ListItem> = {
        name: line.item,
        section: catalogFor(line)?.section ?? 'Other',
        groupId: SUPERMARKET,
        parts: [{ recipeId: recipe.id, recipeTitle: recipe.title, qty: line.qty, unit: line.unit }],
        checked: false,
      };
      if (line.canonicalId !== undefined) row.canonicalId = line.canonicalId;
      pool.push(row);
    }
  }
  const groups = [GENERAL, ...groupIds];
  for (let i = 0; pool.length < to; i += 1) {
    pool.push({
      name: `${HOUSEHOLD[i % HOUSEHOLD.length]} ${Math.floor(i / HOUSEHOLD.length) + 1}`,
      section: 'Other',
      groupId: groups[i % groups.length]!,
      parts: [],
      manual: true,
      checked: false,
    });
  }
  // Every fifth one is already in the trolley.
  return pool.slice(from, to).map((row, index) => ({ ...row, checked: (from + index) % 5 === 4 }));
}

/** A 1×1 JPEG. Signing a URL never reads the file, so size is beside the point. */
export const TINY_JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  ),
  (char) => char.charCodeAt(0),
);
