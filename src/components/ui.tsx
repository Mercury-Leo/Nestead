import { forwardRef, useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';
import { Check, Minus, Plus, Star, TriangleAlert, User, Globe, ShoppingBag, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import s from './ui.module.css';

/**
 * The shared kit. Real <button>, <a> and <input> elements throughout; every
 * touch target is at least 44px.
 */

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------- buttons -- */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'sage' | 'dark';
/** md 44px, lg 52px (page actions), xl 58px (recipe actions), bar 56px (sticky bars). */
export type ButtonSize = 'md' | 'lg' | 'xl' | 'bar';

interface ButtonLook {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconAfter?: LucideIcon;
  block?: boolean;
}

function buttonClass({ variant = 'secondary', size = 'md', block }: ButtonLook, extra?: string): string {
  return cx(s.button, s[variant], s[size], block === true && s.block, extra);
}

export const Button = forwardRef<HTMLButtonElement, ButtonLook & ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ variant, size, icon: Icon, iconAfter: After, block, className, children, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={buttonClass({ variant, size, block }, className)} {...rest}>
        {Icon !== undefined && <Icon size={18} strokeWidth={2} aria-hidden />}
        {children}
        {After !== undefined && <After size={18} strokeWidth={2} aria-hidden />}
      </button>
    );
  },
);

export function ButtonLink({ variant, size, icon: Icon, iconAfter: After, block, className, children, ...rest }: ButtonLook & LinkProps): JSX.Element {
  return (
    <Link className={buttonClass({ variant, size, block }, className)} {...rest}>
      {Icon !== undefined && <Icon size={18} strokeWidth={2} aria-hidden />}
      {children}
      {After !== undefined && <After size={18} strokeWidth={2} aria-hidden />}
    </Link>
  );
}

export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 44,
  className,
  ...rest
}: { label: string; icon: LucideIcon; variant?: ButtonVariant; size?: 36 | 44 | 52 | 56 } & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(s.iconButton, s[variant], className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon size={size >= 52 ? 22 : 18} strokeWidth={2} aria-hidden />
    </button>
  );
}

/* --------------------------------------------------------------- chips -- */

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

/* ------------------------------------------------------------ controls -- */

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

/* --------------------------------------------------------------- stars -- */

/** Five stars with halves, read-only. */
export function Stars({ value, size = 14 }: { value: number; size?: number }): JSX.Element {
  return (
    <span className={s.stars} aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        const pct = fill >= 0.75 ? 100 : fill >= 0.25 ? 50 : 0;
        return (
          <span key={n} className={s.star} style={{ width: size, height: size }}>
            <Star size={size} strokeWidth={0} fill="var(--star-empty)" aria-hidden />
            <span className={s.starFill} style={{ width: `${pct}%` }}>
              <Star size={size} strokeWidth={0} fill="var(--honey)" aria-hidden />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Tap to rate 1-5. Each star is a 44px button. */
export function RatingInput({ value, onChange }: { value: number | undefined; onChange: (value: number) => void }): JSX.Element {
  return (
    <span className={s.rating}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
        >
          <Star size={28} strokeWidth={0} fill={value !== undefined && n <= value ? 'var(--honey)' : 'var(--star-empty)'} aria-hidden />
        </button>
      ))}
    </span>
  );
}

/* -------------------------------------------------------------- badges -- */

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

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <p className={cx(s.eyebrow, className)}>{children}</p>;
}

/* --------------------------------------------------------- match block -- */

/** One segment per ingredient: sage for have or staple, soft terracotta to buy. */
export function MatchBar({ have, total }: { have: number; total: number }): JSX.Element {
  return (
    <span className={s.matchBar} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < have ? s.segHave : s.segMissing} />
      ))}
    </span>
  );
}

export function MatchBlock({
  have,
  total,
  missing,
  need,
  compact = false,
}: {
  have: number;
  total: number;
  missing: number;
  /** Names of what is missing, for "Need: a, b + 2 more". */
  need?: string[];
  compact?: boolean;
}): JSX.Element {
  const needText =
    need === undefined || need.length === 0
      ? null
      : need.length > 2
        ? `${need.slice(0, 2).join(', ')} + ${need.length - 2} more`
        : need.join(', ');
  return (
    <div className={cx(s.match, compact && s.matchCompact)}>
      <div className={s.matchTop}>
        <span className={s.matchText}>
          You have{' '}
          <strong className="tabular">
            {have}/{total}
          </strong>
          {!compact && ' ingredients'}
        </span>
        <BuyPill missing={missing} compact={compact} />
      </div>
      <MatchBar have={have} total={total} />
      {needText !== null && (
        <p className={s.need}>
          Need: <strong>{needText}</strong>
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- photo -- */

const LINENS = ['#E9D9C4', '#DCE3D3', '#EAD3C8', '#D6DEE2', '#EDDDB9', '#E2D5DD', '#D5E0D6', '#F0D9C6'];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A warm linen tile with a plain plate on it, for recipes without a photo. */
export function PhotoPlaceholder({ title, className }: { title: string; className?: string }): JSX.Element {
  const h = hash(title);
  const linen = LINENS[h % LINENS.length];
  const stripe = LINENS[(h + 3) % LINENS.length];
  return (
    <div className={cx(s.placeholder, className)} style={{ background: linen }} aria-hidden>
      <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className={s.placeholderSvg}>
        <defs>
          <radialGradient id={`plate-${h}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#fffdf8" />
            <stop offset="100%" stopColor="#f3ece1" />
          </radialGradient>
        </defs>
        <g opacity="0.55">
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={-10 + i * 9} y="95" width="4" height="80" fill={stripe} transform="rotate(-20 20 130)" />
          ))}
        </g>
        <ellipse cx="102" cy="80" rx="58" ry="58" fill="rgba(41,35,30,0.10)" />
        <circle cx="100" cy="75" r="58" fill={`url(#plate-${h})`} />
        <circle cx="100" cy="75" r="42" fill="none" stroke="rgba(41,35,30,0.06)" strokeWidth="2" />
      </svg>
    </div>
  );
}

/* --------------------------------------------------------- empty state -- */

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

/* --------------------------------------------------------------- sheet -- */

/**
 * A modal: a bottom sheet on phones, a centred dialog on desktop. Built on
 * <dialog>, which gives focus trapping, Esc to close and a top layer for free.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx(s.sheet, className)}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className={s.sheetInner}>
          <span className={s.sheetHandle} aria-hidden />
          <header className={s.sheetHead}>
            <h2 id={titleId} className={s.sheetTitle}>
              {title}
            </h2>
            <IconButton label="Close" icon={X} variant="secondary" size={52} onClick={onClose} />
          </header>
          <div className={s.sheetBody}>{children}</div>
          {footer !== undefined && <footer className={s.sheetFoot}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
