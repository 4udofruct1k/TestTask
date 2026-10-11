/**
 * График веса: одна линия по датам взвешиваний.
 *
 * Линия 2px, точки r=4 с кольцом цвета подложки, сетка — волосяные линии.
 * Подпись значения — у последней точки, остальные — в подсказке: палец
 * ведёт по графику, вертикальная линия прилипает к ближайшему взвешиванию.
 * Таблица значений — история замеров под графиком.
 */

import { useState, type JSX, type PointerEvent } from 'react';
import { addDays, type DateStr } from '../../household/days';
import { dec, shortDate } from './format';

interface Point {
  date: DateStr;
  value: number;
}

const W = 320;
const H = 150;
const PAD = { top: 18, right: 40, bottom: 22, left: 30 };

/** Дни от первой даты: по ним раскладывается ось времени. */
function daysBetween(from: DateStr, to: DateStr): number {
  let n = 0;
  for (let d = from; d < to && n < 3700; d = addDays(d, 1)) n++;
  return n;
}

export function WeightChart({ points }: { points: Point[] }): JSX.Element | null {
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return null;

  const first = points[0]!.date;
  const span = Math.max(1, daysBetween(first, points[points.length - 1]!.date));
  const values = points.map((p) => p.value);
  // Шкала по целым килограммам с запасом: колебания в полкило не выглядят обрывом
  const lo = Math.floor(Math.min(...values) - 0.5);
  const hi = Math.ceil(Math.max(...values) + 0.5);
  const x = (d: DateStr): number => PAD.left + (daysBetween(first, d) / span) * (W - PAD.left - PAD.right);
  const y = (v: number): number => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const step = Math.max(1, Math.ceil((hi - lo) / 3));
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);

  const xs = points.map((p) => x(p.date));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs[i]!.toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  const shown = active === null ? null : points[active]!;

  const pick = (e: PointerEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    xs.forEach((v, i) => {
      if (Math.abs(v - px) < Math.abs(xs[best]! - px)) best = i;
    });
    setActive(best);
  };

  return (
    <div className="w-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Вес с ${shortDate(first)} по ${shortDate(last.date)}: от ${dec(points[0]!.value)} до ${dec(last.value)} кг`}
        tabIndex={0}
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons > 0 || e.pointerType === 'mouse' ? pick(e) : undefined}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? points.length) - 1));
          if (e.key === 'ArrowRight') setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="w-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="w-axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <text className="w-axis" x={PAD.left} y={H - 4}>
          {shortDate(first)}
        </text>
        <text className="w-axis" x={W - PAD.right} y={H - 4} textAnchor="end">
          {shortDate(last.date)}
        </text>

        {shown && <line className="w-cross" x1={x(shown.date)} x2={x(shown.date)} y1={PAD.top - 6} y2={H - PAD.bottom} />}
        <path className="w-line" d={path} />
        {points.map((p, i) => (
          <circle key={p.date} className={`w-dot${i === active ? ' on' : ''}`} cx={xs[i]} cy={y(p.value)} r={i === active ? 5.5 : 4} />
        ))}
        <text className="w-end" x={xs[xs.length - 1]! + 8} y={y(last.value) + 4}>
          {dec(last.value)}
        </text>
      </svg>
      {shown && (
        // Подсказка не вылезает за край карточки у крайних точек
        <div className="w-tip" style={{ left: `${Math.min(86, Math.max(14, (x(shown.date) / W) * 100))}%` }} role="status">
          <b>{dec(shown.value)} кг</b>
          <span>{shortDate(shown.date)}</span>
        </div>
      )}
    </div>
  );
}
