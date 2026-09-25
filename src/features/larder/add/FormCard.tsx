import type { ReactNode } from 'react';
import { cx } from '../../../components/ui';
import s from './AddRecipe.module.css';

export function Card({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }): JSX.Element {
  return (
    <section className={cx(s.card, className)}>
      <header className={s.cardHead}>
        <h2 className={s.cardTitle}>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function ErrorText({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className={s.error} role="alert">
      {children}
    </p>
  );
}
