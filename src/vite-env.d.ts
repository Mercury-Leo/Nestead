/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which data backend createStore() builds. Defaults to "local" when unset. */
  readonly VITE_BACKEND?: 'local' | 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  /** Anon key only. A service-role key must never reach a VITE_* variable. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
