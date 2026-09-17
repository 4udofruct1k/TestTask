/**
 * Раскрытый дашборд: крупная цифра, подпись, большой график, легенда,
 * переключатель периода месяц / квартал / год (3.5).
 *
 * Стрелка здесь возвращает к списку — единственное место, где она
 * значит не «домой» (3.1).
 */

import { useState, type JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { TopBar } from '../components/TopBar';
import { BarsChart, DETAIL_H, OneOffChart, PaceChart, RunwayChart, StackChart } from '../charts';
import { monthShort } from '../format';
import {
  DASHBOARDS,
  figureOf,
  lastMonths,
  oneOffSeries,
  paceSeries,
  periodMonths,
  runwaySeries,
  saveSeries,
  structSeries,
  type DashboardId,
  type Period,
} from './dashboards';
import { daysInMonth } from '../../domain/dates';
import { variableFlow } from '../../engine';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
];

const LEGENDS: Record<DashboardId, [string, string][]> = {
  save: [['Плюс', 'var(--acid-green)'], ['Минус', 'var(--acid-red)']],
  pace: [['Этот месяц', 'var(--acid-green)'], ['Прошлый', 'var(--neu)'], ['Разовые', 'var(--acid-red)']],
  struct: [['Постоянные', 'var(--neu)'], ['Рутина', 'var(--acid-green)'], ['Разовые', 'var(--acid-red)']],
  oneoff: [['Ниже среднего', 'var(--acid-green)'], ['Выше', 'var(--acid-red)']],
  runway: [['Запас', 'var(--acid-green)']],
};

export function DashboardDetail(): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const { dashboardId, go, month: selected } = useUi();
  const [period, setPeriod] = useState<Period>('month');

  const month = selected ?? monthKeyOf(today);
  const id = (dashboardId ?? 'save') as DashboardId;
  const meta = DASHBOARDS.find((d) => d.id === id)!;
  const figure = figureOf(id, doc, month, today, period);

  return (
    <section className="pane">
      <TopBar title={meta.title} burger={false} onBack={() => go('dashboards')} />
      <div className="scroll">
        <div className="detail-body">
          <div>
            <div className="detail-num">{figure.value}</div>
            <div className="detail-lab">{figure.label}</div>
          </div>

          <div className="periods" role="group" aria-label="Период">
            {PERIODS.map((item) => (
              <button key={item.id} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="detail-art">
            <Detail id={id} month={month} period={period} />
          </div>

          <div className="legend">
            {LEGENDS[id].map(([label, color]) => (
              <span key={label}>
                <i style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>

          <p className="card-p">{meta.subtitle}.</p>
        </div>
      </div>
    </section>
  );
}

function Detail({ id, month, period }: { id: DashboardId; month: string; period: Period }): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const months = period === 'month' ? lastMonths(doc, month, 6) : periodMonths(doc, month, period, today);

  switch (id) {
    case 'save': {
      const series = saveSeries(doc, months, today);
      return <BarsChart {...series} height={DETAIL_H} showLabels lastIncomplete />;
    }
    case 'pace': {
      if (period === 'month') {
        const series = paceSeries(doc, month, today);
        return <PaceChart {...series} height={DETAIL_H} showLabels />;
      }
      // За квартал и год дневной кривой нет: показывается средняя рутина в день по месяцам
      return (
        <BarsChart
          values={months.map((m) => Math.round(variableFlow(doc, m, today).routineExpense / daysInMonth(m)))}
          labels={months.map(monthShort)}
          height={DETAIL_H}
          showLabels
        />
      );
    }
    case 'struct':
      return <StackChart items={structSeries(doc, months, today)} height={DETAIL_H} showLabels />;
    case 'oneoff': {
      const series = oneOffSeries(doc, month, today);
      return <OneOffChart items={series.items} avg={series.avg} height={DETAIL_H} showLabels />;
    }
    case 'runway':
      return <RunwayChart items={runwaySeries(doc, months, today)} height={DETAIL_H} showLabels />;
    default:
      return <></>;
  }
}
