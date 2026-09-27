import { withCache } from './cache';
import { createLocalStore } from './local/localStore';
import { createSupabaseStore } from './supabase/supabaseStore';
import type { DataStore } from './types';

/**
 * The swap point. Screens never import a backend directly: they get their store
 * from useSession(). Adding Supabase means adding one case here, once its
 * implementation passes runDataStoreContract() unchanged.
 *
 * Every backend is wrapped in the shared row cache (cache.ts).
 *
 * VITE_BACKEND is compared directly, not through a local, so the build sees a
 * constant condition and leaves the other backend out of the bundle.
 */
export function createStore(familyId: string): DataStore {
  if (import.meta.env.VITE_BACKEND === 'supabase') return withCache(createSupabaseStore(familyId));
  if (import.meta.env.VITE_BACKEND === undefined || import.meta.env.VITE_BACKEND === 'local') {
    return withCache(createLocalStore(familyId));
  }
  throw new Error(`VITE_BACKEND="${import.meta.env.VITE_BACKEND}" is not a known backend. Use "local" or "supabase".`);
}
