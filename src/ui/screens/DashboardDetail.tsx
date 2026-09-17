/**
 * Раскрытый дашборд: крупная цифра, подпись, большой график, легенда,
 * опорные числа, объяснение и переключатель периода месяц / квартал / год (3.5).
 *
 * Стрелка здесь возвращает к списку — единственное место, где она
 * значит не «домой» (3.1).
 */

import { useState, type JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatRub } from '../../domain/money';
import { useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { TopBar } from '../components/TopBar';
import { BarsChart, DETAIL_H, DonutChart, OneOffChart, PaceChart, RunwayChart, StackChart } from '../charts';
import { formatPct, monthShort } from '../format';
import {
  breakdownOf,
  DASHBOARDS,
  factsOf,
  figureOf,
  lastMonths,
  oneOffSeries,
  paceSeries,
  periodMonths,
  runwaySeries,
  saveSeries,
  structSeries,
  type Cut,
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

const CUTS: { id: Cut; label: string }[] = [
  { id: 'category', label: 'По категориям' },
  { id: 'kind', label: 'По видам' },
];

/** У кольца легенда своя — подписанный список под ним, с суммами и долями. */
const LEGENDS: Record<DashboardId, [string, string][]> = {
  save: [['Плюс', 'var(--acid-green)'], ['Минус', 'var(--acid-red)']],
  pace: [['Этот месяц', 'var(--acid-green)'], ['Прошлый', 'var(--neu)'], ['Разовые', 'var(--acid-red)']],
  struct: [['Постоянные', 'var(--neu)'], ['Рутина', 'var(--acid-green)'], ['Разовые', 'var(--acid-red)']],
  oneoff: [['Ниже среднего', 'var(--acid-green)'], ['Выше', 'var(--acid-red)']],
  runway: [['Запас', 'var(--acid-green)']],
  where: [],
};

export function DashboardDetail(): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const { dashboardId, go, month: selected } = useUi();
  const [period, setPeriod] = useState<Period>('month');
  const [cut, setCut] = useState<Cut>('category');

  const month = selected ?? monthKeyOf(today);
  const id = (dashboardId ?? 'save') as DashboardId;
  const meta = DASHBOARDS.find((d) => d.id === id)!;
  const figure = figureOf(id, doc, month, today, period, cut);
  const facts = factsOf(id, doc, month, today, period);
  const legend = LEGENDS[id];

  return (
    <section className="pane">
      <TopBar title={meta.title} burger={false} onBack={() => go('dashboards')} />
      <div className="scroll">
        <div className="detail-body">
          <div>
            <div className="detail-num">{figure.value}</div>
            <div className="detail-lab">{figure.label}</div>
          </div>

          {id === 'where' && (
            <div className="periods" role="group" aria-label="Разрез">
              {CUTS.map((item) => (
                <button key={item.id} aria-pressed={cut === item.id} onClick={() => setCut(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div className="periods" role="group" aria-label="Период">
            {PERIODS.map((item) => (
              <button key={item.id} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="detail-art">
            <Detail id={id} month={month} period={period} cut={cut} />
          </div>

          {id === 'where' ? (
            <CutList month={month} period={period} cut={cut} />
          ) : (
            <div className="legend">
              {legend.map(([label, color]) => (
                <span key={label}>
                  <i style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          )}

          {facts.length > 0 && (
            <div className="facts">
              {facts.map((fact) => (
                <div className="fact" key={fact.label}>
                  <div className="fact-v">{fact.value}</div>
                  <div className="fact-l">{fact.label}</div>
                </div>
              ))}
            </div>
          )}

          <p className="card-p">{meta.explains}</p>
        </div>
      </div>
    </section>
  );
}

/** Подписанный список долей: по самому кольцу числа не читаются. */
function CutList({ month, period, cut }: { month: string; period: Period; cut: Cut }): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const months = periodMonths(doc, month, period, today);
  const view = breakdownOf(doc, months, cut);

  if (view.rows.length === 0) {
    return <p className="hint">В этом периоде трат ещё нет — разложить нечего.</p>;
  }

  return (
    <div className="cuts">
      {view.rows.map((row) => (
        <div className="cut-row" key={row.key}>
          <i style={{ background: row.color }} />
          <span className="cut-n">
            {row.icon ? `${row.icon} ` : ''}
            {row.label}
          </span>
          <span className="cut-v">{formatRub(row.amount)}</span>
          <span className="cut-p">{formatPct(row.share, false)}</span>
        </div>
      ))}
    </div>
  );
}

function Detail({
  id,
  month,
  period,
  cut,
}: {
  id: DashboardId;
  month: string;
  period: Period;
  cut: Cut;
}): JSX.Element {
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
    case 'where': {
      const view = breakdownOf(doc, periodMonths(doc, month, period, today), cut);
      return (
        <DonutChart
          slices={view.rows}
          height={DETAIL_H}
          showLabels
          center={{ value: formatRub(view.total), note: periodNote(period, month) }}
        />
      );
    }
    default:
      return <></>;
  }
}

function periodNote(period: Period, month: string): string {
  if (period === 'quarter') return 'за квартал';
  if (period === 'year') return 'за год';
  return `за ${monthShort(month)}`;
}
