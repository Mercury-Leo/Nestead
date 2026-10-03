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

/** When read() claims a read, what it found: a key to use, a quota, or nothing. */
export type ClaimResult =
  | { mode: 'no-family' }
  | { mode: 'quota-exceeded'; scope: QuotaScope }
  | { mode: 'free' }
  | { mode: 'family'; familyId: string; ciphertext: string; model: string | null };

/** Where read() gets the claim, key, and token for the read, and logs one completed read. */
export interface AiStore {
  /** Asks what read() can do: free, family key, or quota reached. */
  claim(): Promise<ClaimResult | 'unauthorized'>;
  /** Fetches the family's key to decrypt, if mode is family. */
  familyId(): Promise<string | null | 'unauthorized'>;
  /** Stores a key once the user verifies it works. */
  storeKey(ciphertext: string, hint: string): Promise<'unauthorized' | undefined>;
}

/** A log entry from one read. Never includes a key, token, text or output. */
export interface AiLogEntry {
  route: 'extract' | 'key';
  error?: AiError;
  status?: number;
  model?: string;
}

/** read() and checkKey(). Builds the store for one request's token; tests pass their own. Without it, the PostgREST store from supabaseUrl and supabaseKey. */
export interface AiOptions {
  openRouterKey?: string;
  freeModels?: string;
  keySecret?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  fetch?: typeof fetch;
  resolveHost?: (host: string) => Promise<string[]>;
  store?: (token: string) => AiStore;
  timeouts?: Partial<{ model: number; key: number; rpc: number; page: number }>;
  /** Defaults to one JSON line on console.info. Never given a key, token, text or output. */
  log?: (entry: AiLogEntry) => void;
}
