import { forwardRef } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './cx';

/**
 * An icon that mirrors in right-to-left layouts, through .flipRtl in
 * styles/global.css. Only for icons whose left or right means back, forward
 * or out; up/down and symmetric icons stay as they are.
 */
function mirrored(Icon: LucideIcon, name: string): LucideIcon {
  const Mirrored = forwardRef<SVGSVGElement, Parameters<LucideIcon>[0]>(function Mirrored({ className, ...props }, ref) {
    return <Icon ref={ref} className={cx('flipRtl', className)} {...props} />;
  });
  Mirrored.displayName = name;
  return Mirrored;
}

/** Back: points left, or right in RTL. */
export const BackArrow = mirrored(ArrowLeft, 'BackArrow');
/** Forward, next, go: points right, or left in RTL. */
export const ForwardArrow = mirrored(ArrowRight, 'ForwardArrow');
export const ForwardChevron = mirrored(ChevronRight, 'ForwardChevron');
/** Sign out: the arrow leaves through the door at the end of the line. */
export const SignOutIcon = mirrored(LogOut, 'SignOutIcon');
