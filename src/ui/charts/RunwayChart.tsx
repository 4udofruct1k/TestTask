/** 5. Запас прочности — на сколько хватит накопленного (3.5). */

import type { JSX } from 'react';
import { CHART_W, Chart, paint } from './Chart';

interface Props {
  items: { label: string; months: number }[];
  height: number;
  showLabels: boolean;
}

export function RunwayChart({ items, height, showLabels }: Props): JSX.Element {
  const max = Math.max(1, ...items.map((i) => i.months));
  const pad = 14;
  const bottom = showLabels ? 16 : 10;
  const plot = height - bottom - 14;
  const width = (CHART_W - pad * 2) / Math.max(1, items.length);

  return (
    <Chart height={height} labels={showLabels}>
      {items.map((item, i) => {
        const barHeight = (item.months / max) * plot;
        return (
          <g key={i}>
            <rect
              x={pad + i * width + width * 0.24}
              y={height - bottom - barHeight}
              width={width * 0.52}
              height={Math.max(barHeight, 2)}
              rx={3}
              style={paint.positive}
              opacity={0.34 + (i / Math.max(1, items.length - 1)) * 0.66}
            />
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
