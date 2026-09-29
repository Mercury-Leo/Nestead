/**
 * Every request the Supabase clients make, counted and timed.
 *
 * Import this before any client exists: supabase-js keeps the global fetch it
 * finds when a client is created, so a client made earlier is never counted.
 *
 * Requests are attributed to a client by their access token, registered with
 * nameClient(); tokens are compared, never printed.
 */

export interface Hit {
  client: string;
  method: string;
  /** read (REST GET), write (REST POST/PATCH/DELETE), rpc, sign, storage, auth, other. */
  kind: string;
  /** Table, RPC or auth endpoint. */
  target: string;
  start: number;
  end: number;
  /** Response body size after decompression. */
  bytes: number;
  /** Content-Encoding as sent, and Content-Length when the server gave one (the size on the wire). */
  encoding: string;
  wireBytes: number | null;
  status: number;
}

export const hits: Hit[] = [];

const realFetch = globalThis.fetch;
const names = new Map<string, string>();
let inflight = 0;
let lastActivity = performance.now();
/** Added before every request: a crude stand-in for a slower network. */
let extraLatencyMs = 0;

export function nameClient(accessToken: string, name: string): void {
  names.set(accessToken, name);
}

export function setExtraLatency(ms: number): void {
  extraLatencyMs = ms;
}

function classify(url: URL, method: string): { kind: string; target: string } {
  const path = url.pathname;
  if (path.startsWith('/rest/v1/rpc/')) return { kind: 'rpc', target: path.slice('/rest/v1/rpc/'.length) };
  if (path.startsWith('/rest/v1/')) return { kind: method === 'GET' ? 'read' : 'write', target: path.slice('/rest/v1/'.length) };
  if (path.startsWith('/storage/v1/object/sign/')) return { kind: 'sign', target: 'photo' };
  if (path.startsWith('/storage/v1/')) return { kind: 'storage', target: method };
  if (path.startsWith('/auth/v1/')) return { kind: 'auth', target: path.slice('/auth/v1/'.length) };
  return { kind: 'other', target: path };
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = input instanceof Request ? input : null;
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? request?.headers);
  const token = (headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const client = names.get(token) ?? 'other';

  inflight += 1;
  lastActivity = performance.now();
  try {
    if (extraLatencyMs > 0) await new Promise((resolve) => setTimeout(resolve, extraLatencyMs));
    const start = performance.now();
    const response = await realFetch(input, init);
    const body = await response.clone().arrayBuffer();
    const length = response.headers.get('content-length');
    hits.push({
      client, method, ...classify(url, method), start, end: performance.now(), bytes: body.byteLength,
      encoding: response.headers.get('content-encoding') ?? '', wireBytes: length === null ? null : Number(length), status: response.status,
    });
    return response;
  } finally {
    inflight -= 1;
    lastActivity = performance.now();
  }
};

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits until no request has been in flight for quietMs, and returns when the
 * last one ended. Realtime echoes arrive a few hundred milliseconds after a
 * write and set off re-reads, so the quiet window has to outlast them.
 */
export async function settle(quietMs = 2500, limitMs = 90_000): Promise<number> {
  const began = performance.now();
  for (;;) {
    const now = performance.now();
    if (inflight === 0 && now - lastActivity >= quietMs) return lastActivity;
    if (now - began > limitMs) throw new Error(`requests did not settle within ${limitMs} ms`);
    await sleep(25);
  }
}

/** Polls until check() holds. */
export async function until(check: () => boolean, limitMs = 30_000, what = 'condition'): Promise<void> {
  const began = performance.now();
  while (!check()) {
    if (performance.now() - began > limitMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(2);
  }
}
