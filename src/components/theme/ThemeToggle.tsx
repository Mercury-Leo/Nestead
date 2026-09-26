import { Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './theme';
import type { ThemeChoice } from './theme';
import { Segmented } from '../ui';
import s from './ThemeToggle.module.css';

const OPTIONS: { value: ThemeChoice; icon: LucideIcon }[] = [
  { value: 'system', icon: Monitor },
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
];

/**
 * System / Light / Dark. `compact` shows icons only, for the sidebar, where
 * three words do not fit; the words stay for screen readers and as a tooltip.
 */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }): JSX.Element {
  const { t } = useTranslation();
  const { choice, setChoice } = useTheme();
  return (
    <Segmented
      label={t('theme.label')}
      size="sm"
      wrap={!compact}
      className={className}
      value={choice}
      onChange={setChoice}
      options={OPTIONS.map(({ value, icon: Icon }) => {
        const label = t(`theme.${value}`);
        return {
          value,
          label: (
            <span className={s.option} title={compact ? label : undefined}>
              <Icon size={16} strokeWidth={2} aria-hidden />
              <span className={compact ? 'visually-hidden' : undefined}>{label}</span>
            </span>
          ),
        };
      })}
    />
  );
}
