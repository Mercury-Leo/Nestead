import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import s from './Popover.module.css';

/** Between the anchor and the panel, and between the panel and the window's edges. */
const GAP = 6;
const MARGIN = 8;

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A floating panel next to the button that opened it, for a picker too big to
 * sit inline. Render it only while open. It goes into <body>, fixed, so a
 * scrolling list or column around the anchor cannot clip it, and it follows
 * the anchor as anything scrolls. It opens below the anchor, or above when it
 * does not fit below and there is more room above, and scrolls when its
 * content outgrows the room. It picks its side again only as the page scrolls
 * or the window resizes, never as its own content grows or scrolls, so it
 * does not jump under the pointer. It lines up with the anchor's start edge,
 * or its end edge with `align="end"` (for an anchor at the end of its row),
 * mirrored right to left, and stays inside the window.
 *
 * Not modal: a press outside, Esc, or focus going elsewhere calls `onClose`.
 * Esc and tabbing out of either end also put focus back on the anchor. On
 * opening, focus goes to the element marked `data-autofocus`, or the first
 * one that takes it.
 */
export function Popover({
  anchor,
  onClose,
  label,
  align = 'start',
  children,
  className,
}: {
  anchor: RefObject<HTMLElement>;
  onClose: () => void;
  /** Names the panel for screen readers. */
  label: string;
  align?: 'start' | 'end';
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, so the listeners below are added once.
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const panel = ref.current;
    const trigger = anchor.current;
    if (panel === null || trigger === null) return;
    const view = document.documentElement;

    // Straight to the style, not through state: this runs on every scroll.
    const place = (): void => {
      const box = trigger.getBoundingClientRect();
      const roomBelow = view.clientHeight - box.bottom - GAP - MARGIN;
      const roomAbove = box.top - GAP - MARGIN;
      // Its whole content, however much of it the room shows now, plus its border.
      const height = panel.scrollHeight + panel.offsetHeight - panel.clientHeight;
      const up = height > roomBelow && roomAbove > roomBelow;
      const width = panel.offsetWidth;
      // The left edge is the start in left-to-right text, the end in right-to-left.
      const leftEdge = (align === 'start') === (getComputedStyle(trigger).direction !== 'rtl');
      const left = Math.max(MARGIN, Math.min(leftEdge ? box.left : box.right - width, view.clientWidth - width - MARGIN));
      panel.style.left = `${left}px`;
      // The other side stays auto: with both set the panel would stretch between them.
      if (up) {
        panel.style.top = 'auto';
        panel.style.bottom = `${view.clientHeight - box.top + GAP}px`;
        panel.style.maxHeight = `${Math.max(0, roomAbove)}px`;
      } else {
        panel.style.top = `${box.bottom + GAP}px`;
        panel.style.bottom = 'auto';
        panel.style.maxHeight = `${Math.max(0, roomBelow)}px`;
      }
      panel.style.visibility = 'visible';
    };
    place();
    const first = panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });

    // Any scroller can move the anchor (the page, a column's cards), so listen
    // in the capture phase; but not to the panel's own scrolling.
    const onScroll = (event: Event): void => {
      if (!(event.target instanceof Node && panel.contains(event.target))) place();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor, align]);

  useEffect(() => {
    const inside = (target: EventTarget | null): boolean =>
      target instanceof Node && (ref.current?.contains(target) === true || anchor.current?.contains(target) === true);
    const backToAnchor = (): void => {
      anchor.current?.focus();
      close.current();
    };
    const onPointerDown = (event: Event): void => {
      if (!inside(event.target)) close.current();
    };
    const onFocusIn = (event: FocusEvent): void => {
      if (!inside(event.target)) close.current();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        backToAnchor();
        return;
      }
      // The panel sits at the end of <body>, so Tab past its last control
      // would leave the page. Out of either end, back to the anchor instead.
      const panel = ref.current;
      if (event.key !== 'Tab' || panel === null || !panel.contains(document.activeElement)) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const edge = event.shiftKey ? focusable[0] : focusable[focusable.length - 1];
      if (document.activeElement === edge) {
        event.preventDefault();
        backToAnchor();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchor]);

  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} className={cx(s.popover, className)}>
      {children}
    </div>,
    document.body,
  );
}
