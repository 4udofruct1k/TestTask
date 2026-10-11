/**
 * Свайп влево-вправо: листать месяцы в бюджете и дни в общих разделах.
 *
 * Срабатывает, только когда палец ушёл вбок заметно сильнее, чем вниз:
 * обычная прокрутка списка день не переключает.
 */

import { useRef, type TouchEvent } from 'react';

/** Сколько пикселей вбок — уже свайп, а не дрожание пальца. */
const THRESHOLD = 60;

export function useSwipe(
  onLeft: () => void,
  onRight: () => void,
): { onTouchStart(e: TouchEvent): void; onTouchEnd(e: TouchEvent): void } {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e) => {
      const from = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!from || !t) return;
      const dx = t.clientX - from.x;
      const dy = t.clientY - from.y;
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
}
