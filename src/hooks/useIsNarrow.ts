import { useEffect, useState } from 'react';

/**
 * True on phone-width screens, where side-by-side columns do not work.
 *
 * Matches the 768px breakpoint in features/board/board.css. This is here rather than in CSS
 * because the narrow layout changes behaviour, not just appearance: columns
 * become collapsible, which needs state.
 */

const NARROW = '(max-width: 767px)';

export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);

  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const onChange = (event: MediaQueryListEvent): void => setNarrow(event.matches);

    // Re-read in case the width changed between first render and this effect.
    setNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return narrow;
}
