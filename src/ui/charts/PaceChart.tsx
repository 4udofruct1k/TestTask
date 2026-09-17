/**
 * 2. Темп месяца — кривая рутины по дням, пунктиром прошлый месяц,
 * точками разовые покупки (3.5).
 *
 * Разовые вынесены метками, а не влиты в кривую: одна покупка за 60 000
 * даёт ступеньку, после которой форма кривой ничего не говорит (2.6).
 */

import type { JSX } from 'react';
import { CHART_W, Chart, Grid, paint } from './Chart';

interface Props {
  current: (number | null)[];
  previous: number[] | null;
  oneOffs: { day: number; amount: number }[];
  height: number;
  showLabels: boolean;
}

export function PaceChart({ current, previous, oneOffs, height, showLabels }: Props): JSX.Element {
  const pad = 12;
  const top = 14;
  const bottom = showLabels ? 18 : 8;
  const plot = height - top - bottom;
  // Ось — дни показанного месяца. Кривая прошлого месяца обрезается по ней же (2.7)
  const span = Math.max(current.length, 1);

  const max = Math.max(
    1,
    ...current.filter((v): v is number => v !== null),
    ...(previous ?? []),
  );

  const px = (index: number): number => pad + (index / Math.max(1, span - 1)) * (CHART_W - pad * 2);
  const py = (value: number): number => top + plot - (value / max) * plot;

  const points = (values: number[]): string => values.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const currentPoints = current
    .map((v, i) => (v === null ? null : `${px(i)},${py(v)}`))
    .filter((p): p is string => p !== null)
    .join(' ');

  const lastIndex = current.findLastIndex((v) => v !== null);
  const cumulativeAt = (day: number): number => current[day - 1] ?? 0;

  return (
    <Chart height={height} labels={showLabels}>
      <Grid top={top} height={plot} />
      {previous && (
        <polyline points={points(previous)} style={paint.linePrev} strokeDasharray="3 4" />
      )}
      {currentPoints !== '' && (
        <polyline points={currentPoints} style={paint.lineNow} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {lastIndex >= 0 && <circle cx={px(lastIndex)} cy={py(current[lastIndex] as number)} r={4} style={paint.positive} />}
      {oneOffs.map((purchase, i) => (
        <circle
          key={i}
          cx={px(purchase.day - 1)}
          cy={py(cumulativeAt(purchase.day))}
          r={3.4}
          style={paint.negative}
        />
      ))}
      {showLabels && (
        <>
          <text x={pad} y={height - 4} style={paint.axisText}>
            1
          </text>
          <text x={CHART_W - pad} y={height - 4} textAnchor="end" style={paint.axisText}>
            {span}
          </text>
        </>
      )}
    </Chart>
  );
}
