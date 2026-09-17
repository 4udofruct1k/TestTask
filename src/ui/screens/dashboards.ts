/**
 * Данные пяти дашбордов. Раздел 3.5.
 *
 * Здесь только сбор чисел из движка — рисование в компонентах.
 */

import { addMonths, compareMonth, daysInMonth, monthKeyOf } from '../../domain/dates';
import { formatAmount, formatRub } from '../../domain/money';
import type { BudgetDocument, DateStr, MonthKey } from '../../domain/types';
import {
  accumulatedAt,
  clampToHistory,
  compareToPrevious,
  cumulativeByDay,
  monthForecast,
  monthSummary,
  oneOffAnalysis,
  oneOffExpenses,
  periodSummary,
  quarterMonths,
  runway,
  variableFlow,
  yearMonths,
} from '../../engine';
import { dayOfMonth } from '../../domain/dates';
import { formatMonthsCount, formatPct, monthShort } from '../format';

export type DashboardId = 'save' | 'pace' | 'struct' | 'oneoff' | 'runway';
export type Period = 'month' | 'quarter' | 'year';

export interface DashboardMeta {
  id: DashboardId;
  title: string;
  subtitle: string;
}

export const DASHBOARDS: DashboardMeta[] = [
  { id: 'save', title: 'Накопление по месяцам', subtitle: 'Растёшь или стоишь на месте' },
  { id: 'pace', title: 'Темп месяца', subtitle: 'Рутина по дням против прошлого месяца' },
  { id: 'struct', title: 'Структура трат', subtitle: 'Постоянные, рутина и разовые' },
  { id: 'oneoff', title: 'Разовые и среднее', subtitle: 'Месяцы против скользящего среднего' },
  { id: 'runway', title: 'Запас прочности', subtitle: 'На сколько хватит накопленного' },
];

/** Месяцы периода, обрезанные по границам учёта. */
export function periodMonths(doc: BudgetDocument, month: MonthKey, period: Period, today: DateStr): MonthKey[] {
  if (period === 'quarter') return clampToHistory(doc, quarterMonths(month), today);
  if (period === 'year') return clampToHistory(doc, yearMonths(month), today);
  return clampToHistory(doc, [month], today);
}

/** Последние n месяцев до month включительно, не раньше firstMonth. */
export function lastMonths(doc: BudgetDocument, month: MonthKey, n: number): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(month, -i);
    if (compareMonth(m, doc.settings.firstMonth) >= 0) out.push(m);
  }
  return out;
}

export interface Figure {
  value: string;
  label: string;
}

/** Крупная цифра и подпись раскрытого дашборда. */
export function figureOf(
  id: DashboardId,
  doc: BudgetDocument,
  month: MonthKey,
  today: DateStr,
  period: Period,
): Figure {
  const months = periodMonths(doc, month, period, today);
  const incomplete = months.some((m) => compareMonth(m, monthKeyOf(today)) >= 0);
  const suffix = incomplete ? ', по данным на сегодня' : '';

  switch (id) {
    case 'save': {
      const aggregate = periodSummary(doc, months, today);
      return {
        value: `${aggregate.net > 0 ? '+' : ''}${formatRub(aggregate.net)}`,
        label: `${periodLabel(period, month)}${suffix}${aggregate.savingsRate === null ? '' : `, ставка ${formatPct(aggregate.savingsRate, false)}`}`,
      };
    }
    case 'pace': {
      const forecast = monthForecast(doc, month, today);
      if (period === 'month' && forecast) {
        const comparison = compareToPrevious(doc, month, today);
        const previousPace =
          comparison.previous === null ? null : Math.round(comparison.previous / Math.max(1, comparison.cutoffDay));
        return {
          value: `${formatRub(Math.round(forecast.routinePace))}`,
          label:
            previousPace === null
              ? 'в день по рутине'
              : `в день, прошлый месяц шёл по ${formatAmount(previousPace)}`,
        };
      }
      const routine = months.reduce((sum, m) => sum + variableFlow(doc, m, today).routineExpense, 0);
      const totalDays = months.reduce((sum, m) => sum + daysInMonth(m), 0);
      return {
        value: formatRub(Math.round(routine / Math.max(1, totalDays))),
        label: `в день по рутине, ${periodLabel(period, month)}`,
      };
    }
    case 'struct': {
      const aggregate = months.reduce(
        (acc, m) => {
          const s = monthSummary(doc, m, today);
          return acc + s.monthCost;
        },
        0,
      );
      return { value: formatRub(aggregate), label: `стоимость периода${suffix}` };
    }
    case 'oneoff': {
      const analysis = oneOffAnalysis(doc, month, today, doc.settings.oneOffWindow);
      if (analysis.avg === null) {
        return { value: formatRub(analysis.current), label: 'разовые этого месяца, среднего пока нет' };
      }
      return { value: formatRub(analysis.avg), label: 'обычный месяц по разовым' };
    }
    case 'runway': {
      const data = runway(doc, month, today);
      if (data.runwayMonths === null) {
        return { value: '—', label: 'типичный месяц пока не посчитан' };
      }
      return {
        value: `${formatMonthsCount(data.runwayMonths)} ${monthsWordFor(data.runwayMonths)}`,
        label: `при типичном месяце в ${formatRub(data.typicalMonthCost ?? 0)}, по данным учёта`,
      };
    }
    default:
      return { value: '—', label: '' };
  }
}

export function saveSeries(doc: BudgetDocument, months: MonthKey[], today: DateStr) {
  return {
    values: months.map((m) => monthSummary(doc, m, today).net),
    labels: months.map(monthShort),
  };
}

export function structSeries(doc: BudgetDocument, months: MonthKey[], today: DateStr) {
  return months.map((m) => {
    const summary = monthSummary(doc, m, today);
    return {
      label: monthShort(m),
      fixed: summary.fixedExpense,
      routine: summary.routineExpense,
      oneOff: summary.oneOffExpense,
    };
  });
}

export function oneOffSeries(doc: BudgetDocument, month: MonthKey, today: DateStr) {
  const analysis = oneOffAnalysis(doc, month, today, doc.settings.oneOffWindow);
  return {
    items: analysis.byMonth.map((entry) => ({ label: monthShort(entry.month), amount: entry.amount })),
    avg: analysis.avg,
  };
}

export function runwaySeries(doc: BudgetDocument, months: MonthKey[], today: DateStr) {
  return months.map((m) => {
    const data = runway(doc, m, today);
    const typical = data.typicalMonthCost;
    const saved = accumulatedAt(doc, m, today);
    return {
      label: monthShort(m),
      months: typical !== null && typical > 0 ? Math.max(0, saved / typical) : 0,
    };
  });
}

export function paceSeries(doc: BudgetDocument, month: MonthKey, today: DateStr) {
  const previousMonth = addMonths(month, -1);
  const hasPrevious = compareMonth(previousMonth, doc.settings.firstMonth) >= 0;
  return {
    current: cumulativeByDay(doc, month, today),
    previous: hasPrevious
      ? (cumulativeByDay(doc, previousMonth, today).filter((v): v is number => v !== null) as number[])
      : null,
    oneOffs: oneOffExpenses(doc, month).map((expense) => ({
      day: dayOfMonth(expense.date),
      amount: expense.amount,
    })),
  };
}

function periodLabel(period: Period, month: MonthKey): string {
  if (period === 'quarter') return 'за квартал';
  if (period === 'year') return 'за год';
  return `в ${monthShort(month)}`;
}

function monthsWordFor(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const whole = Math.floor(rounded);
  if (rounded !== whole) return 'месяца';
  const ten = whole % 10;
  const hundred = whole % 100;
  if (hundred >= 11 && hundred <= 14) return 'месяцев';
  if (ten === 1) return 'месяц';
  if (ten >= 2 && ten <= 4) return 'месяца';
  return 'месяцев';
}
