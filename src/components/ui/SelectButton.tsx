import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './';
import s from './SelectButton.module.css';

/**
 * A native <select> dressed as a button: sort menus and unit pickers. Native
 * means keyboard, screen reader and phone pickers all work for free.
 */
export function SelectButton<T extends string>({
  value,
  options,
  onChange,
  label,
  icon: Icon,
  shape = 'button',
  display,
  className,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  icon?: LucideIcon;
  shape?: 'button' | 'chip' | 'field';
  /** Shown instead of the selected option's label, e.g. a shorter one. */
  display?: string;
  className?: string;
}): JSX.Element {
  const current = options.find((option) => option.value === value);
  return (
    <span className={cx(s.wrap, s[shape], className)}>
      {Icon !== undefined && <Icon size={18} strokeWidth={2} aria-hidden className={s.icon} />}
      <span className={cx(s.text, current === undefined && s.placeholder)} aria-hidden>
        {display ?? current?.label ?? ''}
      </span>
      <ChevronDown size={18} strokeWidth={2} aria-hidden className={s.chevron} />
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}
