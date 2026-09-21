/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which data backend createStore() builds. Defaults to "local" when unset. */
  readonly VITE_BACKEND?: 'local' | 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable key only. A secret key must never reach a VITE_* variable. */
  readonly VITE_SUPABASE_ANON_KEY?: string;

  // Contract-test credentials, from the gitignored .env.test. Test mode only.
  readonly SUPABASE_TEST_URL?: string;
  readonly SUPABASE_TEST_ANON_KEY?: string;
  readonly SUPABASE_TEST_A_EMAIL?: string;
  readonly SUPABASE_TEST_A_PASSWORD?: string;
  readonly SUPABASE_TEST_B_EMAIL?: string;
  readonly SUPABASE_TEST_B_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
