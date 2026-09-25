import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Router state from a recipe's "Make shopping list": the items it added. */
export interface ListHandoff {
  added: string[];
}

const FLASH_MS = 2000;

/**
 * The items a recipe just added, lit up for two seconds so you can see what
 * came across. The handoff is spent once shown: back or reload do not repeat it.
 */
export function useJustAdded(): ReadonlySet<string> {
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState<ReadonlySet<string>>(() => new Set());
  const added = (location.state as ListHandoff | null)?.added;

  useEffect(() => {
    if (added === undefined) return;
    setFlash(new Set(added));
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [added, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (flash.size === 0) return;
    document.querySelector('[data-just-added]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(() => setFlash(new Set()), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  return flash;
}
