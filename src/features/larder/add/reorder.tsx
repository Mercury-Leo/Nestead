import { useRef } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { GripVertical } from 'lucide-react';
import s from './AddRecipe.module.css';

/** Reordering rows: by drag with a mouse, or by arrow keys on the handle. */

/** The list with one item moved; unchanged if `to` is out of range. */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/**
 * The reorder handle: drag it with a mouse, or focus it and use the arrow
 * keys. Either way the rows move; nothing here depends on dragging.
 */
export function Handle({ label, onMove }: { label: string; onMove: (delta: number) => void }): JSX.Element {
  return (
    <button
      type="button"
      className={s.handle}
      aria-label={`${label}. Press up or down to move.`}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMove(-1);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMove(1);
        }
      }}
    >
      <GripVertical size={18} strokeWidth={2} aria-hidden />
    </button>
  );
}

export function useDragList<T>(list: T[], onChange: (next: T[]) => void) {
  const from = useRef<number | null>(null);
  return (index: number) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      from.current = index;
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event: DragEvent) => {
      if (from.current !== null) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (from.current !== null) onChange(move(list, from.current, index));
      from.current = null;
    },
    onDragEnd: () => {
      from.current = null;
    },
  });
}
