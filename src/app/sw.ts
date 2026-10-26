import { SHELL_CACHE, buildFile, isAppPage, isBuildFile, openPage, refreshShell } from './shellCache';
import type { ShellDeps } from './shellCache';

/**
 * The service worker. The build writes it to /sw.js (`serviceWorker()` in
 * vite.config.ts) and offline.ts registers it. It only decides which requests
 * shellCache.ts answers; every other request reaches the network untouched.
 *
 * It must import nothing but shellCache.ts: a worker script is one classic script,
 * and the build fails if this one would need another file.
 */

// The parts of the worker's global scope used here. The project compiles
// against the DOM library, which has no service-worker types.
interface ExtendableEvent extends Event {
  waitUntil(work: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  /** Missing where the browser has no navigation preload. */
  readonly preloadResponse?: Promise<Response | undefined>;
  respondWith(response: Promise<Response>): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
  readonly ports: readonly MessagePort[];
}
interface WorkerScope {
  readonly location: { readonly origin: string };
  readonly registration: ServiceWorkerRegistration;
  readonly caches: CacheStorage;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: ExtendableMessageEvent) => void): void;
}
declare const self: WorkerScope;

const deps: ShellDeps = {
  caches: self.caches,
  fetch: (input) => fetch(input),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// A new worker takes over at once: it keeps nothing an open page relies on.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  const dropOldCaches = async (): Promise<void> => {
    for (const name of await self.caches.keys()) {
      if (name.startsWith('nestead-') && name !== SHELL_CACHE) await self.caches.delete(name);
    }
  };
  // Each on its own, so storage that fails cannot stop the worker taking over.
  event.waitUntil(
    Promise.allSettled([
      // The page request starts while the worker is still waking up.
      self.registration.navigationPreload?.enable(),
      dropOldCaches(),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (isAppPage(request, self.location.origin)) {
    const preloaded = event.preloadResponse ?? Promise.resolve(undefined);
    const fresh = preloaded.then((response) => response ?? fetch(request));
    const opening = openPage(fresh, deps);
    event.respondWith(opening.response);
    event.waitUntil(opening.finished);
  } else if (isBuildFile(request, self.location.origin)) {
    event.respondWith(buildFile(request, deps));
  }
});

// The one message a page sends (offline.ts): keep the server's page and its
// files now. The reply, on the port sent with it, says that is done or failed.
self.addEventListener('message', (event) => {
  event.waitUntil(
    refreshShell(deps)
      .catch(() => undefined)
      .then(() => event.ports[0]?.postMessage(null)),
  );
});
