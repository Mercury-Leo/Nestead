import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { insertionBefore } from '../board/dragDrop';
import { edgeSpeed, swallowNextClick, type Box } from '../../hooks/pointerDrag';

/**
 * Dragging shopping-list sections into a new order, by the grip in each
 * section's header.
 *
 * Pointer events like the board's card drag, so it works on phones. The grip
 * has touch-action: none, so a finger on it drags straight away rather than
 * scrolling and needs no long press. Either pointer has to move a few pixels
 * first, so a tap on the grip does nothing. The grip's arrow keys do the same
 * from a keyboard.
 *
 * Sections are found through data-section-id, read from the DOM.
 */

/** How far the pointer moves before a press becomes a drag. */
const SLOP = 4;

export interface SectionDrag {
  id: string;
  /** Where the lifted section's header is drawn, following the pointer. */
  ghost: Box;
  /** The gap it would land in, or null where it would not move. */
  line: Box | null;
}

interface Press {
  id: string;
  pointerId: number;
  active: boolean;
  startX: number;
  startY: number;
  y: number;
  offsetY: number;
  left: number;
  width: number;
  height: number;
}

export function useSectionDrag(
  containerRef: RefObject<HTMLElement>,
  onDrop: (id: string, beforeId: string | undefined) => void,
): { drag: SectionDrag | null; startDrag: (event: ReactPointerEvent<HTMLElement>, id: string) => void } {
  const [drag, setDrag] = useState<SectionDrag | null>(null);
  const press = useRef<Press | null>(null);
  const target = useRef<{ beforeId?: string; moves: boolean } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => () => stop.current?.(), []);

  const measure = useCallback(
    (p: Press): void => {
      const container = containerRef.current;
      let line: Box | null = null;
      target.current = null;

      if (container !== null) {
        const all = [...container.querySelectorAll<HTMLElement>('[data-section-id]')].map((section) => ({
          id: section.dataset.sectionId ?? '',
          rect: section.getBoundingClientRect(),
        }));
        const rest = all.filter((section) => section.id !== p.id);
        const beforeId = insertionBefore(
          rest.map(({ id, rect }) => ({ id, top: rect.top, bottom: rect.bottom })),
          p.y,
        );
        const from = all.findIndex((section) => section.id === p.id);
        const to = beforeId === undefined ? rest.length : rest.findIndex((section) => section.id === beforeId);
        const moves = from !== to;
        target.current = { beforeId, moves };

        if (moves) {
          // Halfway across the gap it would land in. At either end there is
          // no second section, so half the usual gap past the one there is.
          const above = rest[to - 1]?.rect;
          const below = rest[to]?.rect;
          const box = container.getBoundingClientRect();
          const middle =
            above !== undefined && below !== undefined
              ? (above.bottom + below.top) / 2
              : below !== undefined
                ? below.top - 12
                : (above?.bottom ?? box.top) + 12;
          line = { top: middle - 1.5, left: box.left, width: box.width, height: 3 };
        }
      }

      setDrag({ id: p.id, ghost: { top: p.y - p.offsetY, left: p.left, width: p.width, height: p.height }, line });
    },
    [containerRef],
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, id: string): void => {
      if (press.current !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const section = event.currentTarget.closest<HTMLElement>('[data-section-id]');
      const head = section?.querySelector('header') ?? event.currentTarget;
      const rect = (section ?? head).getBoundingClientRect();
      const headRect = head.getBoundingClientRect();
      const p: Press = {
        id,
        pointerId: event.pointerId,
        active: false,
        startX: event.clientX,
        startY: event.clientY,
        y: event.clientY,
        offsetY: event.clientY - headRect.top,
        left: rect.left,
        width: rect.width,
        height: headRect.height,
      };
      press.current = p;
      let frame = 0;

      const autoScroll = (): void => {
        if (!p.active) return;
        const dy = edgeSpeed(window.innerHeight - p.y) - edgeSpeed(p.y);
        if (dy !== 0) {
          const before = window.scrollY;
          window.scrollBy(0, dy);
          if (window.scrollY !== before) measure(p);
        }
        frame = requestAnimationFrame(autoScroll);
      };

      const finish = (): void => {
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', finish);
        window.removeEventListener('keydown', onKey, true);
        document.documentElement.classList.remove('is-dragging-section');
        press.current = null;
        target.current = null;
        stop.current = null;
        setDrag(null);
      };

      const onMove = (move: PointerEvent): void => {
        if (move.pointerId !== p.pointerId) return;
        p.y = move.clientY;
        if (!p.active) {
          if (Math.hypot(move.clientX - p.startX, move.clientY - p.startY) <= SLOP) return;
          p.active = true;
          document.documentElement.classList.add('is-dragging-section');
          if (move.pointerType === 'touch') navigator.vibrate?.(10);
          frame = requestAnimationFrame(autoScroll);
        }
        measure(p);
      };

      const onUp = (up: PointerEvent): void => {
        if (up.pointerId !== p.pointerId) return;
        const wasActive = p.active;
        const drop = target.current;
        finish();
        if (!wasActive) return;
        swallowNextClick();
        if (drop?.moves === true) dropRef.current(p.id, drop.beforeId);
      };

      const onKey = (key: KeyboardEvent): void => {
        if (key.key !== 'Escape' || !p.active) return;
        key.preventDefault();
        key.stopPropagation();
        finish();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', finish);
      window.addEventListener('keydown', onKey, true);
      stop.current = finish;
    },
    [measure],
  );

  return { drag, startDrag };
}
