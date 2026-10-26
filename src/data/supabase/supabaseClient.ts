import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withTimeLimits } from './timeLimits';

/**
 * The browser's Supabase client, built from the VITE_* config.
 *
 * Only the publishable key belongs here. It ships inside the bundle and is
 * public by design; it is safe only because RLS gates every table.
 */

let client: SupabaseClient | null = null;

const REMEMBER_KEY = 'nestead.rememberMe';

/**
 * Whether the session should outlive the browser. Defaults to true, which is
 * what Supabase did before this was a choice.
 */
export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Must be called before signing in, so the new session lands in the right store. */
export function setRememberMe(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, String(remember));
  } catch {
    // Storage blocked: the session falls back to whatever Supabase can manage.
  }
}

/**
 * Remembered sessions go to localStorage and survive closing the browser.
 * Others go to sessionStorage and end with the tab. Writes clear the other
 * store so a stale session cannot come back after the choice changes.
 */
const sessionStore = {
  getItem(key: string): string | null {
    return (getRememberMe() ? localStorage : sessionStorage).getItem(key);
  },
  setItem(key: string, value: string): void {
    const [keep, drop] = getRememberMe() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    keep.setItem(key, value);
    drop.removeItem(key);
  },
  removeItem(key: string): void {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

/**
 * Where supabase-js keeps the session. It is the name supabase-js would pick
 * itself, so sessions stored before it was set here still count.
 */
function sessionKey(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

/**
 * The user of the session this device holds, whether or not its token is
 * still fresh; null when it holds none. getSession() answers null while a
 * refresh is failing, so this reads the stored session itself, which carries
 * its user.
 */
export function storedUserId(url: string | undefined = import.meta.env.VITE_SUPABASE_URL): string | null {
  if (url === undefined || url === '') return null;
  try {
    const stored = sessionStore.getItem(sessionKey(url));
    const id = stored === null ? undefined : (JSON.parse(stored) as { user?: { id?: unknown } } | null)?.user?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

let recoveryLink = false;
let linkError: string | null = null;

/**
 * Reads what an email link brought back in the URL hash. This has to happen
 * before createClient: the client parses and clears the hash as it starts, and
 * its PASSWORD_RECOVERY event can fire before React has subscribed.
 */
function readEmailLink(): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  recoveryLink = params.get('type') === 'recovery';
  linkError = params.get('error_description');

  // The client leaves an error hash in place, so clear it to stop it
  // reappearing on reload.
  if (linkError !== null) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/** True once, if the page was opened from a password reset email. */
export function takeRecoveryLink(): boolean {
  const found = recoveryLink;
  recoveryLink = false;
  return found;
}

/** The reason an email link failed (usually that it expired), once. */
export function takeLinkError(): string | null {
  const found = linkError;
  linkError = null;
  return found;
}

export function getSupabaseClient(): SupabaseClient {
  if (client !== null) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url === undefined || url === '' || key === undefined || key === '') {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set to use the supabase backend. See .env.example.',
    );
  }

  readEmailLink();
  client = createClient(url, key, {
    auth: { storage: sessionStore, storageKey: sessionKey(url) },
    // A launch over a connection that hangs must end in a failure that is
    // retried, not wait for good (timeLimits.ts).
    global: { fetch: withTimeLimits((input, init) => fetch(input, init)) },
  });
  return client;
}
