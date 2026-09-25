import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';
import s from './Button.module.css';

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
