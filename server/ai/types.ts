/** Errors from reads: key, network, model choice, quota or structure. */
export type AiError =
  | 'unauthorized'
  | 'invalid-input'
  | 'too-large'
  | 'quota-exceeded'
  | 'key-invalid'
  | 'key-out-of-credit'
  | 'model-failed'
  | 'not-a-recipe'
  | 'timeout'
  | 'unavailable'
  | 'method'
  | 'invalid-url'
  | 'blocked'
  | 'fetch-failed';

/** Who hit the quota: the family's free reads per day, or the app's per day. */
export type QuotaScope = 'user' | 'app';

/** What claim_ai_request() answers: whether the user can read, and if so, free or with a family key. */
export type ClaimResult =
  | { mode: 'no-family' }
  | { mode: 'quota-exceeded'; scope: QuotaScope }
  | { mode: 'free' }
  | { mode: 'family'; familyId: string; ciphertext: string; model: string | null };

/** Implements the claim and key-save routes: /api/ai/extract and /api/ai/key. */
export interface AiStore {
  /** Called once per read in /api/ai/extract: counts a free read or hands back the family's encrypted key. */
  claim(): Promise<ClaimResult | 'unauthorized'>;
  /** Called in /api/ai/key: returns the member's family id, or null when not in a family, or 'unauthorized'. */
  familyId(): Promise<string | null | 'unauthorized'>;
  /** Called after verifying a key: stores the server-made ciphertext and hint. */
  storeKey(ciphertext: string, hint: string): Promise<'unauthorized' | undefined>;
}

/** A log entry from one read. Never includes a key, token, text or output. */
export interface AiLogEntry {
  route: 'extract' | 'key';
  error?: AiError;
  status?: number;
  model?: string;
}

/** Options for the routes and checkKey. */
export interface AiOptions {
  openRouterKey?: string;
  freeModels?: string;
  keySecret?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  fetch?: typeof fetch;
  resolveHost?: (host: string) => Promise<string[]>;
  /** Builds the store for one request's token; tests pass their own. Without it, the PostgREST store from supabaseUrl and supabaseKey. */
  store?: (token: string) => AiStore;
  timeouts?: Partial<{ model: number; key: number; rpc: number; page: number }>;
  /** Defaults to one JSON line on console.info. Never given a key, token, text or output. */
  log?: (entry: AiLogEntry) => void;
  /**
   * Told once, when the handler is made, which OPENROUTER_FREE_MODELS entries
   * it dropped (not a valid `:free` model id), by id. Defaults to console.warn.
   * Never given a key, token, text or output.
   */
  warn?: (message: string) => void;
}
