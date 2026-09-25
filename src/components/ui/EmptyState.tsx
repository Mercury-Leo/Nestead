import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';
import s from './EmptyState.module.css';

export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cx(s.empty, className)}>
      <span className={s.emptyArt} aria-hidden>
        <Icon size={44} strokeWidth={1.6} />
      </span>
      <h2 className={s.emptyTitle}>{title}</h2>
      {children !== undefined && <div className={s.emptyBody}>{children}</div>}
      {actions !== undefined && <div className={s.emptyActions}>{actions}</div>}
    </div>
  );
}
