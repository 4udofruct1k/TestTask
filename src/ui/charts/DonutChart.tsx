/**
 * 6. Куда уходят деньги — кольцо долей (3.5).
 *
 * Кольцо годится только на «часть от целого с первого взгляда» и только
 * пока долей мало: на седьмом секторе глаз перестаёт их различать.
 * Поэтому сегментов не больше шести, мелкие сворачиваются в один, а точные
 * числа лежат в подписанном списке под кольцом — по самому кольцу
 * их читать невозможно.
 */

import type { JSX } from 'react';
import { CHART_W, paint } from './Chart';

export interface DonutSlice {
  label: string;
  amount: number;
  /** Токен цвета: var(--cat-N) */
  color: string;
}

interface Props {
  slices: DonutSlice[];
  height: number;
  showLabels: boolean;
  /** Подпись в отверстии кольца: итог и за какой срок. Только в раскрытом виде */
  center?: { value: string; note: string };
}

/** Сектор кольца. Углы в радианах, ноль наверху. */
function ring(cx: number, cy: number, outer: number, inner: number, from: number, to: number): string {
  const point = (r: number, angle: number): [number, number] => [
    cx + r * Math.sin(angle),
    cy - r * Math.cos(angle),
  ];
  const large = to - from > Math.PI ? 1 : 0;
  const [x1, y1] = point(outer, from);
  const [x2, y2] = point(outer, to);
  const [x3, y3] = point(inner, to);
  const [x4, y4] = point(inner, from);
  return [
    `M ${x1} ${y1}`,
    `A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export function DonutChart({ slices, height, showLabels, center }: Props): JSX.Element {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const cx = CHART_W / 2;
  const cy = height / 2;
  const outer = Math.min(height * 0.4, showLabels ? 84 : 60);
  const inner = outer - (showLabels ? 30 : 22);

  let angle = 0;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${height}`}
      width="100%"
      height={height}
      // Кольцо не растягивается по ширине карточки: овал вместо круга
      // врёт о долях сильнее, чем любая неточность подписи
      preserveAspectRatio="xMidYMid meet"
      style={{ background: 'var(--chart-bg)', display: 'block' }}
      role="img"
    >
      {total <= 0 && (
        <>
          <circle cx={cx} cy={cy} r={outer} style={paint.neutral} />
          <circle cx={cx} cy={cy} r={inner} style={{ fill: 'var(--chart-bg)' }} />
        </>
      )}

      {total > 0 &&
        slices.map((slice) => {
          const from = angle;
          const to = from + (slice.amount / total) * Math.PI * 2;
          angle = to;
          // Единственный сектор — это круг, дугой в 360° он не рисуется
          if (slice.amount >= total) {
            return (
              <g key={slice.label}>
                <circle cx={cx} cy={cy} r={outer} style={{ fill: slice.color }} />
                <circle cx={cx} cy={cy} r={inner} style={{ fill: 'var(--chart-bg)' }} />
              </g>
            );
          }
          return (
            <path
              key={slice.label}
              d={ring(cx, cy, outer, inner, from, to)}
              style={{ fill: slice.color, stroke: 'var(--chart-bg)', strokeWidth: 1.5 }}
            />
          );
        })}

      {center && (
        <>
          <text x={cx} y={cy - 1} textAnchor="middle" style={{ ...paint.inkText, fontSize: 14, fontWeight: 800 }}>
            {center.value}
          </text>
          <text x={cx} y={cy + 13} textAnchor="middle" style={{ ...paint.axisText, fontSize: 9.5 }}>
            {center.note}
          </text>
        </>
      )}
    </svg>
  );
}
