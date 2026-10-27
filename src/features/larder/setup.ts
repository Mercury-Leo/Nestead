import type { DataStore } from '../../data/types';

/**
 * Setting up a family's kitchen the first time the app sees it.
 *
 * The diet profile row is the marker: a family with one has been set up, and
 * one without has not. On Supabase, diet_profiles.family_id is unique, so if
 * two devices set up the same family at once, the second insert fails, which
 * is harmless.
 */

/**
 * A real family: an empty profile, nothing else.
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
  }
}
