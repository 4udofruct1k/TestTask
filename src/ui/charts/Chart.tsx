/**
 * Общая обвязка графиков. Раздел 3.5.
 *
 * Библиотеку не подключаем: пять фиксированных типов графиков, а подложка
 * и сетка обязаны браться из CSS-токенов темы, иначе при тёмной теме
 * графики останутся белыми. Значения токенов подставляются через
 * инлайновый style, а не через getComputedStyle: тема меняется сама.
 */

import type { CSSProperties, JSX, ReactNode } from 'react';

export const CHART_W = 320;
export const PREVIEW_H = 158;
export const DETAIL_H = 210;

export const paint = {
  positive: { fill: 'var(--acid-green)' } as CSSProperties,
  negative: { fill: 'var(--acid-red)' } as CSSProperties,
  neutral: { fill: 'var(--neu)' } as CSSProperties,
  background: { fill: 'var(--chart-bg)' } as CSSProperties,
  grid: { stroke: 'var(--grid)' } as CSSProperties,
  axisText: { fill: 'var(--axis)', fontSize: 9, fontFamily: 'inherit' } as CSSProperties,
  inkText: { fill: 'var(--ink)', fontFamily: 'inherit' } as CSSProperties,
  lineNow: { fill: 'none', stroke: 'var(--acid-green)', strokeWidth: 2.8 } as CSSProperties,
  linePrev: { fill: 'none', stroke: 'var(--neu)', strokeWidth: 1.8 } as CSSProperties,
  dashedAvg: { stroke: 'var(--axis)', strokeWidth: 1.4 } as CSSProperties,
};

interface Props {
  height: number;
  /** В превью подписи не рисуются — они попадали бы под затемнение (3.5) */
  labels: boolean;
  children: ReactNode;
}

export function Chart({ height, labels, children }: Props): JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${height}`}
      width="100%"
      height={labels ? undefined : height}
      preserveAspectRatio={labels ? 'xMidYMid meet' : 'none'}
      role="img"
    >
      <rect width={CHART_W} height={height} style={paint.background} />
      {children}
    </svg>
  );
}

/** Горизонтальные линии сетки. */
export function Grid({ top, height, count = 4 }: { top: number; height: number; count?: number }): JSX.Element {
  return (
    <>
      {Array.from({ length: count - 1 }, (_, i) => (
        <line
          key={i}
          x1={14}
          x2={CHART_W - 14}
          y1={top + ((i + 1) * height) / count}
          y2={top + ((i + 1) * height) / count}
          style={paint.grid}
        />
      ))}
    </>
  );
}
