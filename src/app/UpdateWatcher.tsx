import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { BUILD, watchForUpdates } from './update';
import type { UpdateWatch, UpdateWatchOptions } from './update';

/**
 * Watches for a newer build for the whole app, signed in or not
 * (`watchForUpdates()`, update.ts), and tells the watch when the app moves to
 * another page. A change to the query alone, such as cook mode's step, is not
 * a page change. Renders nothing, and does nothing in a bundle with no build
 * id (the dev server, tests); the options are read once.
 */
export function UpdateWatcher(options: Partial<UpdateWatchOptions> = {}): null {
  const { pathname } = useLocation();
  const watch = useRef<UpdateWatch | null>(null);
  const first = useRef(options);

  useEffect(() => {
    const current = first.current.current ?? BUILD;
    if (current === undefined) return undefined;
    const started = watchForUpdates({ ...first.current, current });
    watch.current = started;
    return () => {
      started.stop();
      watch.current = null;
    };
  }, []);

  const page = useRef(pathname);
  useEffect(() => {
    if (pathname === page.current) return;
    page.current = pathname;
    watch.current?.navigated();
  }, [pathname]);

  return null;
}
