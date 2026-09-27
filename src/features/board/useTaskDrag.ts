import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Task } from '../../domain/types';
import { edgeSpeed, swallowNextClick, type Box } from '../../hooks/pointerDrag';
import { insertionBefore, type DropTarget } from './dragDrop';

export type { Box };

/**
 * Dragging task cards between and within columns.
 *
 * Built on pointer events rather than HTML5 drag and drop, which does nothing
 * on phones. A mouse picks a card up once it moves a few pixels, so a click
 * still opens the card. A finger has to rest on the card first, since a finger
 * moving straight away is scrolling the page.
 *
 * Dragging is a shortcut, not the only way: the card's column menu and its
 * up/down buttons do the same from a keyboard or a screen reader.
 *
 * Columns are found through a data-drop-column attribute and cards through
 * data-task-id, both read from the DOM under the pointer.
 */

/** How far a mouse moves before a press becomes a drag. */
const MOUSE_SLOP = 5;
/** How long a finger rests on a card before it lifts. */
const LONG_PRESS_MS = 350;
/** A finger that moves this far before then is scrolling. */
const TOUCH_SLOP = 8;

export interface ActiveDrag {
  task: Task;
  /** Where the lifted card is drawn, following the pointer. */
  ghost: Box;
  target: DropTarget | null;
  /** The column the card would land in, to outline it. */
  column: Box | null;
  /** The gap the card would land in, to draw a line there. */
  line: Box | null;
}

interface Press {
  task: Task;
  pointerId: number;
  touch: boolean;
  active: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** The pointer's offset within the card, so the ghost stays under it. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  timer?: number;
}

interface TaskDragContextValue {
  startDrag: (event: ReactPointerEvent<HTMLElement>, task: Task) => void;
  draggingId?: string;
}

export const TaskDragContext = createContext<TaskDragContextValue>({ startDrag: () => {} });

export function useTaskDragContext(): TaskDragContextValue {
  return useContext(TaskDragContext);
}

export function useTaskDrag(
  boardRef: RefObject<HTMLElement>,
  onDrop: (task: Task, target: DropTarget) => void,
): { drag: ActiveDrag | null; startDrag: TaskDragContextValue['startDrag'] } {
  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const press = useRef<Press | null>(null);
  const target = useRef<{ drop: DropTarget; column: HTMLElement } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  // Once a card is lifted the finger drags it rather than the page. The
  // listener has to be in place before the touch starts and not passive, or
  // the browser has already committed to scrolling by the time it runs.
  useEffect(() => {
    const board = boardRef.current;
    if (board === null) return;
    const hold = (event: TouchEvent): void => {
      if (press.current?.active === true) event.preventDefault();
    };
    board.addEventListener('touchmove', hold, { passive: false });
    return () => board.removeEventListener('touchmove', hold);
  }, [boardRef]);

  useEffect(() => () => stop.current?.(), []);

  const measure = useCallback(
    (p: Press): void => {
      const board = boardRef.current;
      const found = board === null ? null : findColumn(board, p.x, p.y);
      let column: Box | null = null;
      let line: Box | null = null;
      target.current = null;

      if (found !== null) {
        const cards = [...found.querySelectorAll<HTMLElement>('[data-task-id]')]
          .filter((card) => card.dataset.taskId !== p.task.id)
          .map((card) => ({ id: card.dataset.taskId ?? '', rect: card.getBoundingClientRect() }));
        const beforeId = insertionBefore(
          cards.map(({ id, rect }) => ({ id, top: rect.top, bottom: rect.bottom })),
          p.y,
        );
        target.current = {
          drop: { columnId: found.dataset.dropColumn ?? '', beforeId },
          column: found,
        };
        column = toBox(boxOf(found));

        // Half the gap between cards above the target, or below the last one.
        const next = cards.find((card) => card.id === beforeId)?.rect;
        const last = cards[cards.length - 1]?.rect;
        const edge = next !== undefined ? next.top - 3 : last !== undefined ? last.bottom + 3 : null;
        const span = next ?? last;
        if (edge !== null && span !== undefined) {
          line = { top: edge - 1, left: span.left, width: span.width, height: 2 };
        }
      }

      setDrag({
        task: p.task,
        ghost: { top: p.y - p.offsetY, left: p.x - p.offsetX, width: p.width, height: p.height },
        target: target.current?.drop ?? null,
        column,
        line,
      });
    },
    [boardRef],
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, task: Task): void => {
      if (press.current !== null) return;
      const touch = event.pointerType === 'touch';
      if (!touch && event.button !== 0) return;

      const card = event.currentTarget.closest<HTMLElement>('[data-task-id]') ?? event.currentTarget;
      const rect = card.getBoundingClientRect();
      const p: Press = {
        task,
        pointerId: event.pointerId,
        touch,
        active: false,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      };
      press.current = p;
      let frame = 0;

      const autoScroll = (): void => {
        if (!p.active) return;
        const board = boardRef.current;
        const list = target.current?.column.querySelector<HTMLElement>('.cards') ?? null;
        let scrolled = false;

        // The column's own list first, since on a wide screen it scrolls on
        // its own; then the board sideways; then the page.
        if (list !== null && list.scrollHeight > list.clientHeight) {
          const r = list.getBoundingClientRect();
          scrolled = nudge(list, 0, edgeSpeed(p.y - r.top) * -1 + edgeSpeed(r.bottom - p.y));
        }
        if (board !== null && board.scrollWidth > board.clientWidth) {
          const r = board.getBoundingClientRect();
          scrolled = nudge(board, edgeSpeed(r.right - p.x) - edgeSpeed(p.x - r.left), 0) || scrolled;
        }
        if (!scrolled) {
          const dy = edgeSpeed(window.innerHeight - p.y) - edgeSpeed(p.y);
          if (dy !== 0) {
            const before = window.scrollY;
            window.scrollBy(0, dy);
            scrolled = window.scrollY !== before;
          }
        }
        if (scrolled) measure(p);
        frame = requestAnimationFrame(autoScroll);
      };

      const activate = (): void => {
        p.active = true;
        document.documentElement.classList.add('is-dragging-task');
        if (p.touch) navigator.vibrate?.(10);
        measure(p);
        frame = requestAnimationFrame(autoScroll);
      };

      const finish = (): void => {
        window.clearTimeout(p.timer);
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', finish);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('contextmenu', onContextMenu, true);
        document.documentElement.classList.remove('is-dragging-task');
        press.current = null;
        target.current = null;
        stop.current = null;
        setDrag(null);
      };

      const onMove = (move: PointerEvent): void => {
        if (move.pointerId !== p.pointerId) return;
        p.x = move.clientX;
        p.y = move.clientY;
        if (p.active) {
          measure(p);
          return;
        }
        const distance = Math.hypot(p.x - p.startX, p.y - p.startY);
        if (p.touch) {
          if (distance > TOUCH_SLOP) finish();
        } else if (distance > MOUSE_SLOP) {
          activate();
        }
      };

      const onUp = (up: PointerEvent): void => {
        if (up.pointerId !== p.pointerId) return;
        const wasActive = p.active;
        const drop = target.current?.drop;
        finish();
        if (!wasActive) return;
        swallowNextClick();
        if (drop !== undefined) dropRef.current(p.task, drop);
      };

      const onKey = (key: KeyboardEvent): void => {
        if (key.key !== 'Escape' || !p.active) return;
        key.preventDefault();
        key.stopPropagation();
        swallowNextClick();
        finish();
      };

      // A long press would otherwise open the phone's own menu mid-drag.
      const onContextMenu = (menu: Event): void => {
        if (p.touch) menu.preventDefault();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', finish);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('contextmenu', onContextMenu, true);
      if (p.touch) p.timer = window.setTimeout(activate, LONG_PRESS_MS);
      stop.current = finish;
    },
    [boardRef, measure],
  );

  return { drag, startDrag };
}

/**
 * The column under the pointer, or failing that the column straight above or
 * below it inside the board, so a card dropped under a short column still
 * lands in it.
 */
function findColumn(board: HTMLElement, x: number, y: number): HTMLElement | null {
  const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-column]');
  if (under != null && board.contains(under)) return under;

  const area = board.getBoundingClientRect();
  if (x < area.left || x > area.right || y < area.top || y > area.bottom) return null;

  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const column of board.querySelectorAll<HTMLElement>('[data-drop-column]')) {
    const rect = boxOf(column);
    if (rect === undefined || x < rect.left || x > rect.right) continue;
    const distance = Math.max(rect.top - y, 0, y - rect.bottom);
    if (distance < bestDistance) {
      best = column;
      bestDistance = distance;
    }
  }
  return best;
}

/** The drop wrapper is display: contents and has no box of its own. */
function boxOf(wrapper: HTMLElement): DOMRect | undefined {
  return wrapper.firstElementChild?.getBoundingClientRect();
}

function toBox(rect: DOMRect | undefined): Box | null {
  if (rect === undefined) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function nudge(element: HTMLElement, dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return false;
  const { scrollLeft, scrollTop } = element;
  element.scrollBy(dx, dy);
  return element.scrollLeft !== scrollLeft || element.scrollTop !== scrollTop;
}
