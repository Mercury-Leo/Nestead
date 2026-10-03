import type { AiStore, ClaimResult } from './types';

/**
 * The family's AI settings and the free-read counter, through the database
 * functions in supabase/schema.sql. Every call carries the member's own access
 * token, never a service key, so the database decides what they may do. The
 * only file in server/ that names those functions.
 */

/** Supabase could not be asked, or answered something unexpected. The message never holds the token. */
export class StoreError extends Error {}

export interface PostgrestOptions {
  url: string;
  /** The project's publishable key. */
  key: string;
  /** The member's access token, forwarded from the browser. */
  token: string;
  fetch: typeof fetch;
  timeoutMs: number;
}

export function toClaim(body: unknown): ClaimResult {
  if (typeof body === 'object' && body !== null) {
    const row = body as Record<string, unknown>;
    if (row.mode === 'no-family') return { mode: 'no-family' };
    if (row.mode === 'free') return { mode: 'free' };
    if (row.mode === 'quota-exceeded' && (row.scope === 'user' || row.scope === 'app')) return { mode: 'quota-exceeded', scope: row.scope };
    if (row.mode === 'family' && typeof row.family_id === 'string' && typeof row.ciphertext === 'string' && (row.model === null || typeof row.model === 'string')) {
      return { mode: 'family', familyId: row.family_id, ciphertext: row.ciphertext, model: row.model };
    }
  }
  throw new StoreError('claim_ai_request: unexpected answer');
}

export function postgrestStore(options: PostgrestOptions): AiStore {
  const base = options.url.replace(/\/+$/, '');
  const doFetch = options.fetch;

  async function rpc(name: string, args: Record<string, unknown> = {}): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await doFetch(`${base}/rest/v1/rpc/${name}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { apikey: options.key, authorization: `Bearer ${options.token}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(args),
      });
      const text = await response.text();
      let body: unknown = null;
      if (text !== '') {
        try {
          body = JSON.parse(text);
        } catch {
          throw new StoreError(`${name}: answer is not JSON`);
        }
      }
      return { status: response.status, body };
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError(`${name}: ${controller.signal.aborted ? 'timed out' : 'unreachable'}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const ok = (name: string, status: number): void => {
    if (status < 200 || status >= 300) throw new StoreError(`${name}: status ${status}`);
  };

  return {
    async claim() {
      const { status, body } = await rpc('claim_ai_request');
      if (status === 401) return 'unauthorized';
      ok('claim_ai_request', status);
      return toClaim(body);
    },
    async familyId() {
      const { status, body } = await rpc('current_family_id');
      if (status === 401) return 'unauthorized';
      ok('current_family_id', status);
      return typeof body === 'string' && body !== '' ? body : null;
    },
    async storeKey(ciphertext, hint) {
      const { status } = await rpc('store_family_ai_key', { ciphertext, hint });
      if (status === 401) return 'unauthorized';
      ok('store_family_ai_key', status);
      return undefined;
    },
  };
}
