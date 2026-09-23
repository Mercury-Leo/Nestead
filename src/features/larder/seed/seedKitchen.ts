import type { DataStore } from '../../../data/types';
import type { NewRow, Recipe } from '../../../domain/types';
import {
  DEFAULT_STAPLES,
  SEED_CUSTOM_RULES,
  SEED_HAVE,
  SEED_LIST,
  SEED_PRESETS,
  listRow,
  pantryRow,
} from './kitchen';
import { SEED_LIBRARY } from './recipes';

/**
 * Setting up a family's kitchen the first time the app sees it.
 *
 * The diet profile row is the marker: a family with one has been set up, and
 * one without has not. On Supabase, diet_profiles.family_id is unique, so if
 * two devices set up the same family at once, the second insert fails and that
 * device leaves the staples to the first.
 */

/**
 * A real family: an empty profile and the default staples, nothing else.
 *
 * Never throws. This runs while signing in, and a kitchen that cannot be set
 * up (the kitchen migration not applied yet, a network blip) must not keep
 * anyone off the board; it is tried again on the next sign-in.
 */
export async function ensureKitchen(store: DataStore): Promise<void> {
  try {
    if ((await store.dietProfiles.list()).length > 0) return;
    await store.dietProfiles.create({ presets: {}, custom: [], conflictMode: 'hide' });
  } catch (error) {
    console.warn('Kitchen not set up:', error);
    return;
  }
  try {
    for (const name of DEFAULT_STAPLES) await store.pantry.create(pantryRow(name, 'staple'));
  } catch (error) {
    console.warn('Could not add the default staples:', error);
  }
}

/** The demo family: the full Larder seed, so every screen has something on it. */
export async function seedDemoKitchen(store: DataStore): Promise<void> {
  if ((await store.dietProfiles.list()).length > 0) return;

  await store.dietProfiles.create({ presets: SEED_PRESETS, custom: [...SEED_CUSTOM_RULES], conflictMode: 'hide' });
  for (const name of DEFAULT_STAPLES) await store.pantry.create(pantryRow(name, 'staple'));
  for (const name of SEED_HAVE) await store.pantry.create(pantryRow(name, 'have'));

  // Oldest first, so the library's "Recently added" puts the first one on top.
  const ids = new Map<string, string>();
  for (const recipe of [...SEED_LIBRARY].reverse()) {
    const { id: slug, inLibrary: _inLibrary, ...content } = recipe;
    const created = await store.recipes.create(content as NewRow<Recipe>);
    ids.set(slug, created.id);
  }

  for (const spec of SEED_LIST) {
    await store.listItems.create(listRow(spec, ids.get(spec.recipeId) ?? spec.recipeId));
  }
}

/** Development only: empty the kitchen so the demo seed runs again. */
export async function clearKitchen(store: DataStore): Promise<void> {
  for (const row of await store.listItems.list()) await store.listItems.remove(row.id);
  for (const row of await store.recipes.list()) await store.recipes.remove(row.id);
  for (const row of await store.pantry.list()) await store.pantry.remove(row.id);
  for (const row of await store.dietProfiles.list()) await store.dietProfiles.remove(row.id);
}
