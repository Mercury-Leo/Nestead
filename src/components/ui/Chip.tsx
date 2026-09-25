import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';
import s from './Chip.module.css';

export function Chip({
  selected,
  onClick,
  children,
  icon: Icon,
  tone = 'default',
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'dark';
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={cx(s.chip, selected === true && s.chipOn, tone === 'dark' && s.chipDark, className)}
      aria-pressed={selected}
      onClick={onClick}
    >
      {Icon !== undefined && <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  );
}

/** A chip with a remove button: pantry items, tags, equipment, filters. */
export function RemovableChip({
  children,
  onRemove,
  removeLabel,
  icon: Icon,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
  icon?: LucideIcon;
  tone?: 'default' | 'dark' | 'sunk';
  className?: string;
}): JSX.Element {
  return (
    <span className={cx(s.removable, tone === 'dark' && s.removableDark, tone === 'sunk' && s.removableSunk, className)}>
      {Icon !== undefined && <Icon size={16} strokeWidth={2} aria-hidden />}
      <span>{children}</span>
      <button type="button" className={s.removeX} aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
        <X size={16} strokeWidth={2} aria-hidden />
      </button>
    </span>
  );
}

/** Small read-only label: diet rules in the sidebar and filters. */
export function Tag({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <span className={cx(s.tag, className)}>{children}</span>;
}
