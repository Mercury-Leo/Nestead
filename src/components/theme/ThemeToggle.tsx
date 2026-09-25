import { Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from './theme';
import type { ThemeChoice } from './theme';
import { Segmented } from '../ui';
import s from './ThemeToggle.module.css';

const OPTIONS: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/**
 * System / Light / Dark. `compact` shows icons only, for the sidebar, where
 * three words do not fit; the words stay for screen readers and as a tooltip.
 */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }): JSX.Element {
  const { choice, setChoice } = useTheme();
  return (
    <Segmented
      label="Theme"
      size="sm"
      className={className}
      value={choice}
      onChange={setChoice}
      options={OPTIONS.map(({ value, label, icon: Icon }) => ({
        value,
        label: (
          <span className={s.option} title={compact ? label : undefined}>
            <Icon size={16} strokeWidth={2} aria-hidden />
            <span className={compact ? 'visually-hidden' : undefined}>{label}</span>
          </span>
        ),
      }))}
    />
  );
}
