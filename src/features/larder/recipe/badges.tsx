import type { ReactNode } from 'react';
import { Globe, TriangleAlert, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../../components/ui/cx';
import s from './badges.module.css';

export function SourceBadge({ kind, className }: { kind: 'mine' | 'web'; className?: string }): JSX.Element {
  const { t } = useTranslation();
  return kind === 'mine' ? (
    <span className={cx(s.badge, s.badgeMine, className)}>
      <User size={13} strokeWidth={2.2} aria-hidden /> {t('recipe.badge.mine')}
    </span>
  ) : (
    <span className={cx(s.badge, s.badgeWeb, className)}>
      <Globe size={13} strokeWidth={2.2} aria-hidden /> {t('recipe.badge.web')}
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

export function EstTag({ children }: { children?: ReactNode }): JSX.Element {
  const { t } = useTranslation();
  return <span className={s.est}>{children ?? t('recipe.badge.estimated')}</span>;
}
