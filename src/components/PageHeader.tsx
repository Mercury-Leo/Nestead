import type { ReactNode } from 'react';
import { cx } from './ui';
import s from './PageHeader.module.css';

/** Serif page title, a subtitle and the page's actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <header className={cx(s.header, className)}>
      <div className={s.text}>
        <h1 className={s.title}>{title}</h1>
        {subtitle !== undefined && <p className={s.subtitle}>{subtitle}</p>}
      </div>
      {actions !== undefined && <div className={s.actions}>{actions}</div>}
    </header>
  );
}
