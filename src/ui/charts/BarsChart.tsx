/** 1. Накопление по месяцам — столбцы, минус вниз (3.5). */

import type { JSX } from 'react';
import { CHART_W, Chart, paint } from './Chart';

interface Props {
  values: number[];
  labels: string[];
  height: number;
  showLabels: boolean;
  /** Последний месяц ещё идёт — столбец приглушён, факт с прогнозом не смешивается */
  lastIncomplete?: boolean;
}

export function BarsChart({ values, labels, height, showLabels, lastIncomplete }: Props): JSX.Element {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const pad = 14;
  const bottom = showLabels ? 16 : 6;
  const zero = (height - bottom) * 0.6;
  const width = (CHART_W - pad * 2) / Math.max(1, values.length);

  return (
    <Chart height={height} labels={showLabels}>
      <line x1={pad} x2={CHART_W - pad} y1={zero} y2={zero} style={paint.grid} />
      {values.map((value, i) => {
        const barHeight = (Math.abs(value) / max) * ((height - bottom) * 0.38);
        const x = pad + i * width + width * 0.22;
        const w = width * 0.56;
        const y = value >= 0 ? zero - barHeight : zero;
        const dimmed = lastIncomplete && i === values.length - 1;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={w}
              height={Math.max(barHeight, 2)}
              rx={3}
              style={value >= 0 ? paint.positive : paint.negative}
              opacity={dimmed ? 0.5 : 1}
            />
            {showLabels && (
              <text x={x + w / 2} y={height - 4} textAnchor="middle" style={paint.axisText}>
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </Chart>
  );
}
