import type { DataStore } from '../../data/types';
import { pantryRow } from '../../domain/kitchen/pantry';

/**
 * Setting up a family's kitchen the first time the app sees it.
 *
 * The diet profile row is the marker: a family with one has been set up, and
 * one without has not. On Supabase, diet_profiles.family_id is unique, so if
 * two devices set up the same family at once, the second insert fails and that
 * device leaves the staples to the first.
 */

/** What every new family starts with, demo or not. */
export const DEFAULT_STAPLES: readonly string[] = [
  'Water', 'Salt', 'Black pepper', 'Olive oil', 'Vegetable oil', 'Sugar', 'All-purpose flour', 'Baking soda',
];

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
