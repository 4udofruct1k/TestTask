/** 3. Структура трат — составные столбцы: постоянные, рутина, разовые (3.5). */

import type { JSX } from 'react';
import { CHART_W, Chart, paint } from './Chart';

export interface StackItem {
  label: string;
  fixed: number;
  routine: number;
  oneOff: number;
}

interface Props {
  items: StackItem[];
  height: number;
  showLabels: boolean;
}

export function StackChart({ items, height, showLabels }: Props): JSX.Element {
  const totals = items.map((i) => i.fixed + i.routine + i.oneOff);
  const max = Math.max(1, ...totals);
  const pad = 14;
  const bottom = showLabels ? 16 : 8;
  const plot = height - bottom - 12;
  const width = (CHART_W - pad * 2) / Math.max(1, items.length);

  return (
    <Chart height={height} labels={showLabels}>
      {items.map((item, i) => {
        const parts = [
          { value: item.fixed, style: paint.neutral },
          { value: item.routine, style: paint.positive },
          { value: item.oneOff, style: paint.negative },
        ];
        let acc = 0;
        return (
          <g key={i}>
            {parts.map((part, j) => {
              const barHeight = (part.value / max) * plot;
              const y = height - bottom - acc - barHeight;
              acc += barHeight;
              return (
                <rect
                  key={j}
                  x={pad + i * width + width * 0.2}
                  y={y}
                  width={width * 0.6}
                  height={Math.max(barHeight, 0)}
                  style={part.style}
                  opacity={j === 2 ? 0.88 : 1}
                />
              );
            })}
            {showLabels && (
              <text x={pad + i * width + width * 0.5} y={height - 4} textAnchor="middle" style={paint.axisText}>
                {item.label}
              </text>
            )}
          </g>
        );
      })}
    </Chart>
  );
}
