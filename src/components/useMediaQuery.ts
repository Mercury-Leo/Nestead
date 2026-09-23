import { useEffect, useState } from 'react';

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * The app's main breakpoint: a sidebar, persistent panels and two-column pages
 * from 1024px, a tab bar and bottom sheets below. Matches the @media rules in
 * the CSS modules.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
