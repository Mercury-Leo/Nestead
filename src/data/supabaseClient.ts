import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser's Supabase client, built from the VITE_* config.
 *
 * Only the publishable key belongs here. It ships inside the bundle and is
 * public by design; it is safe only because RLS gates every table.
 */

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client !== null) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url === undefined || url === '' || key === undefined || key === '') {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set to use the supabase backend. See .env.example.',
    );
  }

  client = createClient(url, key);
  return client;
}
