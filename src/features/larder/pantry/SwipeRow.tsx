import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../../components/ui';
import type { PantryItem } from '../../../domain/types';
import { useDirection } from '../../../hooks/useDirection';
import s from './Pantry.module.css';

/**
 * A row you can swipe towards its start (left, or right in RTL) to reveal
 * Remove, which sits at its end. The × button does the same. dx is in reading
 * direction: negative is towards the start, whichever way that is on screen.
 */
export function SwipeRow({ item, onRemove }: { item: PantryItem; onRemove: () => void }): JSX.Element {
  const { t } = useTranslation();
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const REVEAL = 96;
  // Converts between screen pixels and reading direction.
  const sign = useDirection() === 'rtl' ? -1 : 1;

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse') return;
    start.current = { x: event.clientX - dx * sign, y: event.clientY, id: event.pointerId };
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const origin = start.current;
    if (origin === null) return;
    const x = (event.clientX - origin.x) * sign;
    if (Math.abs(event.clientY - origin.y) > Math.abs(x) && dx === 0) return;
    setDx(Math.max(-REVEAL, Math.min(0, x)));
  };
  const up = (): void => {
    start.current = null;
    setDx((value) => (value < -REVEAL / 2 ? -REVEAL : 0));
  };

  return (
    <li className={cx(s.swipe, dx !== 0 && s.swipeOpen)}>
      <button type="button" className={s.swipeAction} tabIndex={dx === 0 ? -1 : 0} onClick={onRemove}>
        {t('common.remove')}
      </button>
      <div
        className={s.swipeFront}
        style={{ transform: `translateX(${dx * sign}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <span className={s.swipeName} dir="auto">
          {item.name}
        </span>
        <button type="button" className={s.rowRemove} aria-label={t('pantry.remove', { name: item.name })} onClick={onRemove}>
          <X size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </li>
  );
}
