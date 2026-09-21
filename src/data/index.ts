import { createLocalStore } from './localStore';
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
    default:
      throw new Error(
        `VITE_BACKEND="${backend}" is not implemented yet. The only backend available today is "local".`,
      );
  }
}
