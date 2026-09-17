/** 4. Разовые и среднее — столбцы месяцев и линия скользящего среднего (3.5). */

import type { JSX } from 'react';
import { CHART_W, Chart, paint } from './Chart';

interface Props {
  items: { label: string; amount: number }[];
  avg: number | null;
  height: number;
  showLabels: boolean;
}

export function OneOffChart({ items, avg, height, showLabels }: Props): JSX.Element {
  const max = Math.max(1, ...items.map((i) => i.amount), avg ?? 0);
  const pad = 14;
  const bottom = showLabels ? 16 : 8;
  const plot = height - bottom - 12;
  const width = (CHART_W - pad * 2) / Math.max(1, items.length);
  const avgY = avg === null ? null : height - bottom - (avg / max) * plot;

  return (
    <Chart height={height} labels={showLabels}>
      {items.map((item, i) => {
        const barHeight = (item.amount / max) * plot;
        return (
          <g key={i}>
            <rect
              x={pad + i * width + width * 0.24}
              y={height - bottom - barHeight}
              width={width * 0.52}
              height={Math.max(barHeight, 2)}
              rx={3}
              style={avg !== null && item.amount > avg ? paint.negative : paint.positive}
            />
            {showLabels && (
              <text x={pad + i * width + width * 0.5} y={height - 4} textAnchor="middle" style={paint.axisText}>
                {item.label}
              </text>
            )}
          </g>
        );
      })}
      {avgY !== null && (
        <line x1={pad} x2={CHART_W - pad} y1={avgY} y2={avgY} style={paint.dashedAvg} strokeDasharray="5 4" />
      )}
    </Chart>
  );
}
