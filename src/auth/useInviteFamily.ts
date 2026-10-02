import { useEffect, useState } from 'react';
import type { Account } from '../data/types';

/**
 * Which family an invite code is for, so the screens it opens can say so.
 * Asked of the account, which answers signed out too.
 *
 * - found: the family's name.
 * - unknown: no family has the code, usually because it was rotated.
 * - unavailable: no answer (offline, or the database function not deployed);
 *   the screens fall back to saying there is an invite without naming it.
 */
export type InviteFamily = { kind: 'loading' } | { kind: 'found'; name: string } | { kind: 'unknown' } | { kind: 'unavailable' };

export function useInviteFamily(account: Account, code: string | null): InviteFamily {
  const [family, setFamily] = useState<InviteFamily>({ kind: 'loading' });

  useEffect(() => {
    if (code === null) return;
    let live = true;
    const settle = (next: InviteFamily): void => {
      if (live) setFamily(next);
    };
    account.inviteFamilyName(code).then(
      (name) => settle(name !== null ? { kind: 'found', name } : { kind: 'unknown' }),
      () => settle({ kind: 'unavailable' }),
    );
    return () => {
      live = false;
    };
  }, [account, code]);

  return family;
}
