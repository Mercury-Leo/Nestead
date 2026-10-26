/**
 * Time limits on the Supabase requests a launch waits on. supabase-js sets
 * none, so a connection that hung rather than failed kept the app on Loading
 * for good: first the token refresh a launch after an hour away starts, then
 * the first reads (2026-10-27). With a limit such a request fails like any
 * other, and what already handles failures takes over: supabase-js retries a
 * refresh for up to 30 s, and failed reads are retried and shown as LoadFailed
 * (`../cache.ts`, `../../auth/accountSession.tsx`).
 *
 * Writes get none: one given up after the server applied it would be undone
 * on screen although it happened.
 */

/**
 * A token request (a refresh, or signing in) with no answer in this long
 * fails. Kept under the 10 s in which Supabase still takes a refresh token it
 * has just rotated, so if the server did get a refresh whose answer was lost,
 * the try after it is still accepted rather than signing the person out.
 */
export const TOKEN_TIMEOUT_MS = 8_000;

/** A read with no answer in this long fails. Generous: a page of 1000 rows over a slow phone connection. */
export const READ_TIMEOUT_MS = 15_000;

/** The time limit for a request, or undefined for none. */
export function timeLimit(url: string, method: string): number | undefined {
  const path = new URL(url).pathname;
  if (path.endsWith('/auth/v1/token')) return TOKEN_TIMEOUT_MS;
  if (path.includes('/rest/v1/') && (method === 'GET' || method === 'HEAD')) return READ_TIMEOUT_MS;
  return undefined;
}

/** `base` with timeLimit() applied: past it the request is aborted, and its promise rejects. */
export function withTimeLimits(base: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const limit = timeLimit(url, method);
    if (limit === undefined) return base(input, init);

    const controller = new AbortController();
    const outer = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (outer?.aborted) controller.abort(outer.reason);
    else outer?.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
    // Left running after the headers arrive: a body can stall too, and an
    // abort once it has been read changes nothing.
    setTimeout(() => controller.abort(new DOMException(`No answer within ${limit / 1000} s`, 'TimeoutError')), limit);
    return base(input, { ...init, signal: controller.signal });
  };
}
