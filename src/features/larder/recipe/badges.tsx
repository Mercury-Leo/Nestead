import type { ReactNode } from 'react';
import { Check, Globe, ShoppingBag, TriangleAlert, User } from 'lucide-react';
import { cx } from '../../../components/ui/cx';
import s from './badges.module.css';

export function SourceBadge({ kind, className }: { kind: 'mine' | 'web'; className?: string }): JSX.Element {
  return kind === 'mine' ? (
    <span className={cx(s.badge, s.badgeMine, className)}>
      <User size={13} strokeWidth={2.2} aria-hidden /> Mine
    </span>
  ) : (
    <span className={cx(s.badge, s.badgeWeb, className)}>
      <Globe size={13} strokeWidth={2.2} aria-hidden /> Web
    </span>
  );
}

export function WarningBadge({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <span className={cx(s.warning, className)}>
      <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />
      {children}
    </span>
  );
}

export function BuyPill({ missing, compact = false }: { missing: number; compact?: boolean }): JSX.Element {
  return missing === 0 ? (
    <span className={cx(s.pill, s.pillSage, compact && s.pillCompact)}>
      <Check size={13} strokeWidth={2.4} aria-hidden /> Nothing to buy
    </span>
  ) : (
    <span className={cx(s.pill, s.pillAccent, compact && s.pillCompact)}>
      <ShoppingBag size={13} strokeWidth={2.2} aria-hidden /> {missing} to buy
    </span>
  );
}

export function EstTag({ children = 'EST.' }: { children?: ReactNode }): JSX.Element {
  return <span className={s.est}>{children}</span>;
}
