import { createLocalStore } from './localStore';
import { createSupabaseStore } from './supabaseStore';
import type { DataStore } from './types';

/**
 * The swap point. Screens never import a backend directly: they get their store
 * from useSession(). Adding Supabase means adding one case here, once its
 * implementation passes runDataStoreContract() unchanged.
 */
export function createStore(familyId: string): DataStore {
  const backend = import.meta.env.VITE_BACKEND ?? 'local';

  switch (backend) {
    case 'local':
      return createLocalStore(familyId);
    case 'supabase':
      return createSupabaseStore(familyId);
    default:
      throw new Error(
        `VITE_BACKEND="${backend}" is not a known backend. Use "local" or "supabase".`,
      );
  }
}
