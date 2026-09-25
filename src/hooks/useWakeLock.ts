import { useEffect } from 'react';

/** Holds the screen awake while cooking, and takes it back on the way out. */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let active = true;
    const request = async (): Promise<void> => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock === undefined || document.visibilityState !== 'visible') return;
        const next = await nav.wakeLock.request('screen');
        if (active) lock = next;
        else void next.release();
      } catch {
        // Not supported or not allowed; cooking goes on regardless.
      }
    };
    void request();
    // The browser drops the lock when the tab is hidden; take it again on return.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
