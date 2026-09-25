import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';
import s from './controls.module.css';

/** Form controls. Native inputs underneath, so keyboards and screen readers work. */

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

/** One-of-several choice. A radio group underneath, so arrow keys work. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}): JSX.Element {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx(s.segmented, size === 'sm' && s.segmentedSm, className)}>
      {options.map((option) => (
        <label key={option.value} className={cx(s.segment, option.value === value && s.segmentOn)}>
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx(s.switchHit, className)}
      onClick={() => onChange(!checked)}
    >
      <span className={cx(s.switchTrack, checked && s.switchOn)}>
        <span className={s.switchThumb} />
      </span>
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  className,
  size = 24,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
  size?: 24 | 26;
}): JSX.Element {
  return (
    <label className={cx(s.check, className)}>
      <input type="checkbox" className="visually-hidden" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className={cx(s.checkBox, checked && s.checkBoxOn)} style={{ width: size, height: size }} aria-hidden>
        {checked && <Check size={size - 8} strokeWidth={3} />}
      </span>
      <span className={s.checkLabel}>{children}</span>
    </label>
  );
}

export function RadioList<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: ReactNode; hint?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}): JSX.Element {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={s.radioList}>
      {options.map((option) => (
        <label key={option.value} className={s.radio}>
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span className={cx(s.radioDot, option.value === value && s.radioDotOn)} aria-hidden />
          <span>
            <span className={s.radioLabel}>{option.label}</span>
            {option.hint !== undefined && <span className={s.radioHint}>{option.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/** A text input with an optional leading icon. Pass `label` for screen readers. */
export const TextField = forwardRef<
  HTMLInputElement,
  { label: string; icon?: LucideIcon; showLabel?: boolean; wrapClassName?: string; suffix?: string } & InputHTMLAttributes<HTMLInputElement>
>(function TextField({ label, icon: Icon, showLabel = false, wrapClassName, suffix, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cx(s.fieldWrap, wrapClassName)}>
      <label htmlFor={inputId} className={showLabel ? s.fieldLabel : 'visually-hidden'}>
        {label}
      </label>
      <div className={cx(s.field, Icon !== undefined && s.fieldWithIcon, className)}>
        {Icon !== undefined && <Icon className={s.fieldIcon} size={20} strokeWidth={2} aria-hidden />}
        <input ref={ref} id={inputId} {...rest} />
        {suffix !== undefined && <span className={s.fieldSuffix}>{suffix}</span>}
      </div>
    </div>
  );
});

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  caption,
  className,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  caption?: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={cx(s.stepper, className)} role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus size={18} strokeWidth={2} aria-hidden />
      </button>
      <span className={s.stepperValue} aria-live="polite">
        <span className="tabular">{value}</span>
        {caption !== undefined && <span className={s.stepperCaption}>{caption}</span>}
      </span>
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus size={18} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
