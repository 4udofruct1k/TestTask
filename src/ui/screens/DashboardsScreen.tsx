/**
 * Дашборды. Раздел 3.5: вертикальный список карточек с живым предпросмотром,
 * а не картинкой. Подписи месяцев в превью не рисуются — они попадали бы
 * под затемнение.
 */

import type { JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { TopBar } from '../components/TopBar';
import { BarsChart, DonutChart, OneOffChart, PaceChart, PREVIEW_H, RunwayChart, StackChart } from '../charts';
import {
  breakdownOf,
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
} from './dashboards';

export function DashboardsScreen(): JSX.Element {
  const { go, openDashboard, month: selected } = useUi();
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const month = selected ?? monthKeyOf(today);

  return (
    <section className="pane">
      <TopBar title="Дашборды" onBack={() => go('home')} />
      <div className="scroll">
        <div className="dlist">
          {DASHBOARDS.map((item) => {
            // Карточка без числа не отвечает ни на один вопрос: сама цифра
            // месяца и есть причина её открыть (3.5)
            const figure = figureOf(item.id, doc, month, today, 'month');
            return (
              <button key={item.id} className="dcard" onClick={() => openDashboard(item.id)}>
                <div className="dcard-art">
                  <Preview id={item.id} month={month} />
                </div>
                <div className="dcard-cap">
                  <div className="dcard-h">
                    <span className="dcard-t">{item.title}</span>
                    <span className="dcard-v">{figure.value}</span>
                  </div>
                  <div className="dcard-s">{figure.label}</div>
                  <div className="dcard-x">{item.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Preview({ id, month }: { id: DashboardId; month: string }): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const months = lastMonths(doc, month, 6);

  switch (id) {
    case 'save': {
      const series = saveSeries(doc, months, today);
      return <BarsChart {...series} height={PREVIEW_H} showLabels={false} lastIncomplete />;
    }
    case 'pace': {
      const series = paceSeries(doc, month, today);
      return <PaceChart {...series} height={PREVIEW_H} showLabels={false} />;
    }
    case 'struct':
      return <StackChart items={structSeries(doc, months, today)} height={PREVIEW_H} showLabels={false} />;
    case 'oneoff': {
      const series = oneOffSeries(doc, month, today);
      return <OneOffChart items={series.items} avg={series.avg} height={PREVIEW_H} showLabels={false} />;
    }
    case 'runway':
      return <RunwayChart items={runwaySeries(doc, months, today)} height={PREVIEW_H} showLabels={false} />;
    case 'where': {
      const view = breakdownOf(doc, periodMonths(doc, month, 'month', today), 'category');
      return <DonutChart slices={view.rows} height={PREVIEW_H} showLabels={false} />;
    }
    default:
      return <></>;
  }
}
