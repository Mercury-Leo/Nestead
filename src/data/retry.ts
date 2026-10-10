/**
 * When to try a failed read again. The row cache (cache.ts) and the session's
 * start (../auth/accountSession.tsx) back off the same way, and both hurry
 * when the connection or the tab comes back: a phone that wakes, or a laptop
 * back on the network, usually fails its first reads.
 */

/** The waits before trying again after each failure in a row; the last repeats. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/** The wait after this many failures in a row (one or more). */
export function retryDelay(failures: number): number {
  return RETRY_MS[Math.min(Math.max(failures, 1), RETRY_MS.length) - 1] as number;
}

/**
 * Hidden at least this long, a tab shown again counts as coming back after a
 * while: realtime may have missed changes meanwhile, so open rows are read again.
 */
export const AWAY_MS = 30_000;

const listeners = new Set<(awayMs: number) => void>();
let listening = false;
let hiddenAt: number | null = null;

function notify(awayMs: number): void {
  for (const listener of [...listeners]) listener(awayMs);
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  window.addEventListener('online', () => notify(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    notify(away);
  });
}

/**
 * Calls `onBack` whenever the browser comes back online (with 0) or the tab is
 * shown again (with how long it was hidden). Returns the way to stop.
 */
export function onComeBack(onBack: (awayMs: number) => void): () => void {
  listen();
  listeners.add(onBack);
  return () => {
    listeners.delete(onBack);
  };
}
