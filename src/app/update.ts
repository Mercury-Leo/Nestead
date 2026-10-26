import { writesSettled } from '../data/useCollection';
import { keepLatestBuild } from './offline';

/**
 * Reloads a tab left open across a deploy, so it stops running the old build.
 *
 * Nothing else would: the service worker (shellCache.ts) answers only a
 * launch or reload, and a phone keeps a tab or a home-screen app alive for
 * days. An old build carries on until a deploy
 * changes the database under it, and then its writes fail. On 2026-10-11 a
 * phone still on the build from before the board's done-tasks migration could
 * not add a column: it sent a field the migration had dropped.
 *
 * Every build carries its id in the bundle and in /version.json
 * (`buildVersion()` in vite.config.ts). The tab asks for /version.json when it
 * is shown again or comes back online, on a page change, and every 15 minutes
 * while it stays in view, at most once a minute. Once the server has another
 * build, the tab reloads at the first moment that loses nothing:
 *
 *   * the next time the app moves to another page;
 *   * or, right after the check that found it, if the check came from the
 *     tab being shown, the connection coming back or a page change, nothing
 *     has been pressed or typed since then, and no text field holds text.
 *
 * Either way it first waits for writes on their way to the backend, and for
 * the service worker to keep the new build (offline.ts), for up to
 * WRITE_WAIT_MS. It
 * reloads at most once for a given build, so a server still sending the old
 * page cannot keep reloading the tab.
 */

/** At most one check this often. */
export const CHECK_GAP_MS = 60_000;

/** A check this often while the tab stays in view. */
export const CHECK_EVERY_MS = 15 * 60_000;

/** The longest a reload waits for writes on their way and the new build's download: one that hangs must not keep the old build forever. */
export const WRITE_WAIT_MS = 10_000;

/** The build this tab last reloaded for, kept for the tab across the reload. */
const RELOADED_FOR = 'nestead:reloadedFor';

/** This bundle's build; undefined under the dev server and in tests, which have no version.json. */
export const BUILD: string | undefined = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined;

export interface UpdateWatchOptions {
  /** The build this tab runs. */
  current: string;
  /** The build the server has now, or undefined when that could not be read. */
  latest?: () => Promise<string | undefined>;
  reload?: () => void;
  /** Resolves once no write is on its way. */
  settled?: () => Promise<void>;
  /**
   * Resolves once the service worker keeps the server's build, so the reload
   * opens it from there rather than racing the worker's wait on a slow
   * connection (shellCache.ts).
   */
  download?: () => Promise<void>;
}

export interface UpdateWatch {
  /** The app moved to another page: a reload now loses nothing. */
  navigated: () => void;
  stop: () => void;
}

export function watchForUpdates({
  current,
  latest = readLatest,
  reload = () => window.location.reload(),
  settled = writesSettled,
  download = keepLatestBuild,
}: UpdateWatchOptions): UpdateWatch {
  /** The other build the server has, once a check has found one. */
  let waiting: string | null = null;
  let lastCheck = -Infinity;
  let checking: Promise<void> | null = null;
  /** Pressed or typed since the tab was last shown: a reload could cut it off. */
  let touched = false;
  let reloading = false;

  const check = (): Promise<void> => {
    if (checking !== null) return checking;
    if (Date.now() - lastCheck < CHECK_GAP_MS) return Promise.resolve();
    lastCheck = Date.now();
    checking = latest()
      .then((version) => {
        if (version !== undefined && version !== current) waiting = version;
      })
      .catch(() => undefined)
      .finally(() => {
        checking = null;
      });
    return checking;
  };

  const reloadForWaiting = (): void => {
    const version = waiting;
    if (version === null || reloading || readReloadedFor() === version) return;
    // Recorded first: without it a reload could be the start of a loop.
    if (!writeReloadedFor(version)) return;
    reloading = true;
    const ready = Promise.all([settled(), download().catch(() => undefined)]);
    void Promise.race([ready, new Promise((resolve) => setTimeout(resolve, WRITE_WAIT_MS))]).then(reload);
  };

  const reloadIfIdle = (): void => {
    if (document.visibilityState !== 'visible' || touched || hasTypedText()) return;
    reloadForWaiting();
  };

  const onShown = (): void => {
    if (document.visibilityState !== 'visible') return;
    touched = false;
    void check().then(reloadIfIdle);
  };
  const onVisibility = (): void => onShown();
  const onPageShow = (event: PageTransitionEvent): void => {
    // Back from the back-forward cache: the page as it was, maybe days ago.
    if (event.persisted) onShown();
  };
  const onOnline = (): void => {
    void check().then(reloadIfIdle);
  };
  const onTouch = (): void => {
    touched = true;
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('online', onOnline);
  for (const type of ['pointerdown', 'keydown', 'input'] as const) window.addEventListener(type, onTouch, true);
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void check();
  }, CHECK_EVERY_MS);

  return {
    navigated() {
      // One already reloaded for and still not running is passed over, so a newer one can be found.
      if (waiting !== null && readReloadedFor() !== waiting) {
        reloadForWaiting();
        return;
      }
      // The new page has only just opened: found now, the build can still
      // replace it, unless the person starts on it while the check is out.
      touched = false;
      void check().then(reloadIfIdle);
    },
    stop() {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      for (const type of ['pointerdown', 'keydown', 'input'] as const) window.removeEventListener(type, onTouch, true);
      window.clearInterval(timer);
    },
  };
}

/** Kinds of input that always hold a value, so a value is not something typed. */
const NOT_TYPED = new Set(['hidden', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'button', 'reset', 'image', 'number', 'date', 'time', 'datetime-local', 'month', 'week']);

/** Whether any text field on the page holds text, which a reload would throw away. */
export function hasTypedText(root: ParentNode = document): boolean {
  for (const field of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
    if (field instanceof HTMLInputElement && NOT_TYPED.has(field.type)) continue;
    if (field.value.trim() !== '') return true;
  }
  return false;
}

/** The build the server has now. Undefined when it cannot say, such as offline or before version.json existed. */
async function readLatest(): Promise<string | undefined> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    const version = typeof body === 'object' && body !== null ? (body as { version?: unknown }).version : undefined;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

function readReloadedFor(): string | null {
  try {
    return sessionStorage.getItem(RELOADED_FOR);
  } catch {
    return null;
  }
}

function writeReloadedFor(version: string): boolean {
  try {
    sessionStorage.setItem(RELOADED_FOR, version);
    return true;
  } catch {
    return false;
  }
}
