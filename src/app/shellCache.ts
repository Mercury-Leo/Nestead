/**
 * How the service worker (sw.ts) opens the app, so that once the app has
 * opened on a device, a launch never waits on the network for longer than
 * SHELL_WAIT_MS.
 *
 * Every page of the app is the same index.html (Cloudflare Pages sends it for
 * any path it has no file for), and the page only starts once its script,
 * stylesheet and preloaded chunks have arrived. Before the worker, every
 * launch fetched the page again, and a connection that hung rather than
 * failed (a phone just unlocked, Wi-Fi handing over to mobile data) left the
 * installed app on a white screen with no reload button (2026-10-27).
 *
 * So the worker keeps one copy of the page and the files it starts with. A
 * launch or reload:
 *
 *   * asks the server for the page, and for any file it starts with that is
 *     not kept yet, as before, so a deploy still opens on the next launch;
 *   * opens what the server sent once all of that has arrived, and keeps it
 *     in place of the copy before;
 *   * opens the kept copy instead when that takes longer than SHELL_WAIT_MS
 *     or fails, and lets the download finish for the next launch;
 *   * waits on the server, as before, when nothing is kept yet.
 *
 * The kept files also answer the page's own requests for them. Everything
 * else (other build files, /api/*, Supabase) reaches the network as if there
 * were no worker. No service-worker globals here, so it runs under Vitest.
 */

/** The worker's one cache: the kept page and its files. sw.ts drops caches by any other name. */
export const SHELL_CACHE = 'nestead-shell-v1';

/** What the kept page is stored under, whichever path brought it. */
export const SHELL_KEY = '/';

/** How long a launch waits for the server before it opens the kept copy. */
export const SHELL_WAIT_MS = 4_000;

export interface ShellDeps {
  caches: CacheStorage;
  fetch: (input: RequestInfo | URL) => Promise<Response>;
  /** Resolves after `ms`. */
  wait: (ms: number) => Promise<void>;
}

/** A launch or reload of one of the app's pages: a navigation on this origin, not to a file or an /api/ route. */
export function isAppPage(request: Request, origin: string): boolean {
  if (request.mode !== 'navigate' || request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== origin || url.pathname.startsWith('/api/')) return false;
  // A dot in the last segment is a file: /version.json, /icons/icon.svg.
  return !/\.[^/]*$/.test(url.pathname);
}

/** One of the build's files. Vite names them after their contents, so a kept one never goes stale. */
export function isBuildFile(request: Request, origin: string): boolean {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === origin && url.pathname.startsWith('/assets/');
}

/** The build files a page starts with: its script, preloaded chunks and stylesheet. */
export function startFiles(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\s(?:src|href)="(\/assets\/[^"?#]+)"/g)) found.add(match[1] as string);
  return [...found];
}

/**
 * Keeps the server's page once every file it starts with is kept too, then
 * drops the files the copy before started with. Resolves to the page to open.
 * Rejects when the page or a file could not be fetched, or the server sent
 * something that is not the app (an error page), and then keeps nothing new.
 */
async function keep(response: Response, cache: Cache, deps: ShellDeps): Promise<Response> {
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.includes('text/html')) throw new Error(`Not the app's page: ${response.status} ${type}`);
  const html = await response.clone().text();
  const files = startFiles(html);
  if (files.length === 0) throw new Error("Not the app's page: it starts with no build files");

  await Promise.all(
    files.map(async (file) => {
      if ((await cache.match(file)) !== undefined) return;
      const fetched = await deps.fetch(file);
      if (!fetched.ok) throw new Error(`Could not fetch ${file}: ${fetched.status}`);
      await cache.put(file, fetched);
    }),
  );
  // Only once its files are in: a copy whose files are missing would hang just the same.
  await cache.put(SHELL_KEY, new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));

  const wanted = new Set([SHELL_KEY, ...files]);
  for (const request of await cache.keys()) {
    if (!wanted.has(new URL(request.url).pathname)) await cache.delete(request);
  }
  return response;
}

export interface Opening {
  /** The page to open. */
  response: Promise<Response>;
  /** Settles once the server's page and files are kept, or could not be; the worker stays alive until then. */
  finished: Promise<void>;
}

/**
 * Answers a launch or reload (isAppPage). `fresh` is the server's answer,
 * asked for already (navigation preload) or just now.
 */
export function openPage(fresh: Promise<Response>, deps: ShellDeps): Opening {
  const cache = deps.caches.open(SHELL_CACHE);
  // Storage that fails (full, corrupt) is nothing kept: the app still opens from the server.
  const kept = cache.then((open) => open.match(SHELL_KEY)).catch(() => undefined);
  const arrived = cache.then((open) => fresh.then((response) => keep(response, open, deps)));

  const response = kept.then(async (copy) => {
    // Nothing to fall back on: the server's answer, as before there was a worker.
    if (copy === undefined) return arrived.catch(() => fresh);
    const late = deps.wait(SHELL_WAIT_MS).then(() => undefined);
    return (await Promise.race([arrived, late]).catch(() => undefined)) ?? copy;
  });

  return { response, finished: arrived.then(() => undefined, () => undefined) };
}

/**
 * Fetches the server's page and its files and keeps them: when the worker
 * starts on a page that opened without it, and before a reload onto a new
 * build (update.ts), so the reload opens it straight from the copy.
 */
export async function refreshShell(deps: ShellDeps): Promise<void> {
  const cache = await deps.caches.open(SHELL_CACHE);
  await keep(await deps.fetch(SHELL_KEY), cache, deps);
}

/** A build file from the kept copy, else (or when storage fails) from the network as usual. */
export async function buildFile(request: Request, deps: ShellDeps): Promise<Response> {
  const kept = await deps.caches
    .open(SHELL_CACHE)
    .then((cache) => cache.match(request, { ignoreVary: true }))
    .catch(() => undefined);
  return kept ?? deps.fetch(request);
}
