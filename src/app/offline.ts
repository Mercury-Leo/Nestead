/**
 * The page's side of the service worker (sw.ts, shellCache.ts), which opens the
 * app from a kept copy when the network hangs. Builds only, like the update
 * watch: under the dev server and in tests there is no /sw.js.
 */

/** Registers the worker once the page has loaded, so it never competes with the app starting. */
export function startOfflineCopy(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = (): void => {
    // A page the worker did not open (the first launch with it, a hard
    // reload) is not kept yet, so the worker fetches it now.
    const opened = navigator.serviceWorker.controller !== null;
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => (opened ? undefined : askToKeep(registration.active)))
      .catch((error: unknown) => console.warn('Could not start the offline copy:', error));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/**
 * Has the worker keep the server's page and its files now, so a reload onto a
 * new build opens from the copy instead of racing SHELL_WAIT_MS on a slow
 * connection. Resolves once that is done or failed, at once with no worker.
 */
export function keepLatestBuild(): Promise<void> {
  if (!('serviceWorker' in navigator)) return Promise.resolve();
  return askToKeep(navigator.serviceWorker.controller);
}

function askToKeep(worker: ServiceWorker | null): Promise<void> {
  if (worker === null) return Promise.resolve();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    worker.postMessage(null, [channel.port2]);
  });
}
