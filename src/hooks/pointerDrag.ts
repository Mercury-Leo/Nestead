/**
 * Pieces shared by the pointer-event drags: task cards on the board and
 * sections on the shopping list.
 */

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Near an edge the view scrolls, faster the closer the pointer gets. */
const EDGE = 56;
const MAX_SPEED = 16;

/** Scroll speed for a pointer this far inside an edge; nothing outside the zone. */
export function edgeSpeed(distance: number): number {
  if (distance >= EDGE || distance < 0) return 0;
  return Math.ceil(((EDGE - distance) / EDGE) * MAX_SPEED);
}

/**
 * Releasing a drag over the element it started on would click it. The click
 * comes straight after pointerup, so the flag only has to last one tick.
 */
export function swallowNextClick(): void {
  const swallow = (click: MouseEvent): void => {
    click.preventDefault();
    click.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}
