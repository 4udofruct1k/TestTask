/**
 * Данные дашбордов. Раздел 3.5.
 *
 * Здесь только сбор чисел из движка — рисование в компонентах.
 */

import { addMonths, compareMonth, daysInMonth, monthKeyOf } from '../../domain/dates';
import { formatAmount, formatRub, formatSignedRub } from '../../domain/money';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../../domain/types';
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
  spendingByCategory,
  spendingByKind,
  variableFlow,
  yearMonths,
  type SpendKind,
} from '../../engine';
import { dayOfMonth } from '../../domain/dates';
import { categoriesWord, formatMonthsCount, formatPct, monthShort } from '../format';

export type DashboardId = 'save' | 'pace' | 'struct' | 'oneoff' | 'runway' | 'where';
export type Period = 'month' | 'quarter' | 'year';

export interface DashboardMeta {
  id: DashboardId;
  title: string;
  subtitle: string;
  /** Зачем на это смотреть: что дашборд отвечает и какое решение из него следует */
  explains: string;
}

export const DASHBOARDS: DashboardMeta[] = [
  {
    id: 'save',
    title: 'Накопление по месяцам',
    subtitle: 'Растёшь или стоишь на месте',
    explains:
      'Столбец месяца — то, что осталось после всех трат. Вверх откладывается, вниз проедается ' +
      'накопленное. Ряд из шести столбцов отвечает на вопрос, который один месяц не решает: ' +
      'это случайный провал или так идёт всегда.',
  },
  {
    id: 'pace',
    title: 'Темп месяца',
    subtitle: 'Рутина по дням против прошлого месяца',
    explains:
      'Линия — сколько рутины накопилось с первого числа. Серая рядом — тот же день прошлого ' +
      'месяца. Пока линия идёт ниже серой, месяц дешевле обычного; если ушла выше — до конца ' +
      'месяца ещё есть время сбавить.',
  },
  {
    id: 'struct',
    title: 'Структура трат',
    subtitle: 'Постоянные, рутина и разовые',
    explains:
      'Из чего складывается месяц. Нижняя часть столбца — постоянные платежи, их быстро не ' +
      'изменить. Средняя — рутина, она и поддаётся. Верхняя — разовые, по ним месяцы и скачут.',
  },
  {
    id: 'oneoff',
    title: 'Разовые и среднее',
    subtitle: 'Месяцы против скользящего среднего',
    explains:
      'Разовые рваные по природе: в феврале ноль, в марте двадцать тысяч. Сравнивать их с ' +
      'прошлым месяцем бессмысленно, поэтому здесь база — среднее за несколько месяцев. ' +
      'Столбец выше черты значит «месяц дороже обычного», а не «всё пропало».',
  },
  {
    id: 'runway',
    title: 'Запас прочности',
    subtitle: 'На сколько хватит накопленного',
    explains:
      'Сколько месяцев можно прожить на накопленном, если доход прекратится, а траты останутся ' +
      'обычными. Считается по данным учёта, а не по остатку на счетах.',
  },
  {
    id: 'where',
    title: 'Куда уходят деньги',
    subtitle: 'Доли категорий и видов трат',
    explains:
      'Один месяц целиком, разложенный на доли. Разрез по категориям показывает, на что уходит ' +
      'больше всего, разрез по видам — сколько в месяце неизбежного: постоянные платежи урезать ' +
      'нечем, рутину можно сбавить, разовое можно отложить.',
  },
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
  cut: Cut = 'category',
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
    case 'where': {
      const view = breakdownOf(doc, months, cut);
      if (view.total <= 0) return { value: formatRub(0), label: `трат ${periodLabel(period, month)} пока нет` };
      const top = view.rows[0];
      return {
        value: formatRub(view.total),
        label:
          top === undefined
            ? `всего трат ${periodLabel(period, month)}${suffix}`
            : `всего трат, больше всего — ${top.label.toLocaleLowerCase('ru-RU')}, ${formatPct(top.share, false)}`,
      };
    }
    default:
      return { value: '—', label: '' };
  }
}

// ------------------------------------------------------------- разрез трат

/** Разрез: по категориям или по видам трат. */
export type Cut = 'category' | 'kind';

/**
 * Шесть оттенков в постоянном порядке. Цикл по ним не идёт: седьмой сектор
 * повторил бы цвет первого, и доля читалась бы неверно — вместо этого
 * хвост сворачивается в одну долю (правило шести секторов).
 */
const CUT_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'];

const MAX_SLICES = 6;

const KIND_TITLES: Record<SpendKind, string> = {
  FIXED: 'Постоянные',
  ROUTINE: 'Рутина',
  ONE_OFF: 'Разовые',
};

export interface BreakdownRow {
  key: string;
  label: string;
  /** Значок категории; у видов трат его нет */
  icon?: string;
  amount: Money;
  count: number;
  /** Доля от целого, 0..1 */
  share: number;
  color: string;
}

export interface BreakdownView {
  rows: BreakdownRow[];
  total: Money;
  /** Сколько категорий свернулось в последнюю долю */
  folded: number;
}

export function breakdownOf(doc: BudgetDocument, months: MonthKey[], cut: Cut): BreakdownView {
  const { rows, folded } = cut === 'kind' ? kindRows(doc, months) : categoryRows(doc, months);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return {
    rows: rows.map((row) => ({ ...row, share: total > 0 ? row.amount / total : 0 })),
    total,
    folded,
  };
}

interface Rows {
  rows: BreakdownRow[];
  folded: number;
}

function categoryRows(doc: BudgetDocument, months: MonthKey[]): Rows {
  const acc = new Map<string, { amount: Money; count: number }>();
  for (const month of months) {
    for (const entry of spendingByCategory(doc, month)) {
      const found = acc.get(entry.categoryId);
      if (found) {
        found.amount += entry.amount;
        found.count += entry.count;
      } else {
        acc.set(entry.categoryId, { amount: entry.amount, count: entry.count });
      }
    }
  }

  const sorted = [...acc.entries()]
    .filter(([, value]) => value.amount > 0)
    .sort((a, b) => b[1].amount - a[1].amount);

  const head = sorted.length > MAX_SLICES ? sorted.slice(0, MAX_SLICES - 1) : sorted;
  const tail = sorted.slice(head.length);

  const rows: BreakdownRow[] = head.map(([categoryId, value], i) => {
    const category = doc.categories.find((c) => c.id === categoryId);
    return {
      key: categoryId,
      label: category?.name ?? 'Категория удалена',
      icon: category?.icon,
      amount: value.amount,
      count: value.count,
      share: 0,
      color: CUT_COLORS[i] ?? CUT_COLORS[0]!,
    };
  });

  if (tail.length > 0) {
    rows.push({
      key: 'rest',
      label: `Ещё ${categoriesWord(tail.length)}`,
      amount: tail.reduce((sum, [, value]) => sum + value.amount, 0),
      count: tail.reduce((sum, [, value]) => sum + value.count, 0),
      share: 0,
      color: CUT_COLORS[MAX_SLICES - 1]!,
    });
  }

  return { rows, folded: tail.length };
}

function kindRows(doc: BudgetDocument, months: MonthKey[]): Rows {
  const acc = new Map<SpendKind, { amount: Money; count: number }>();
  for (const month of months) {
    for (const entry of spendingByKind(doc, month)) {
      const found = acc.get(entry.kind);
      if (found) {
        found.amount += entry.amount;
        found.count += entry.count;
      } else {
        acc.set(entry.kind, { amount: entry.amount, count: entry.count });
      }
    }
  }

  // Цвет привязан к виду, а не к месту в списке: постоянные всегда одного цвета
  const order: SpendKind[] = ['FIXED', 'ROUTINE', 'ONE_OFF'];
  return {
    rows: order
      .map((kind, i) => ({
        key: kind,
        label: KIND_TITLES[kind],
        amount: acc.get(kind)?.amount ?? 0,
        count: acc.get(kind)?.count ?? 0,
        share: 0,
        color: CUT_COLORS[i]!,
      }))
      .filter((row) => row.amount > 0),
    folded: 0,
  };
}

// ------------------------------------------------------- цифры под графиком

export interface Fact {
  label: string;
  value: string;
}

/**
 * Две-три опорные цифры раскрытого дашборда: график показывает форму,
 * а «сколько именно» по нему не прочитать (3.5).
 */
export function factsOf(
  id: DashboardId,
  doc: BudgetDocument,
  month: MonthKey,
  today: DateStr,
  period: Period,
): Fact[] {
  const months = periodMonths(doc, month, period, today);

  switch (id) {
    case 'save': {
      const aggregate = periodSummary(doc, months, today);
      return [
        { label: 'Доход', value: formatRub(aggregate.totalIncome) },
        { label: 'Потрачено', value: formatRub(aggregate.totalIncome - aggregate.net) },
        { label: 'Ставка накопления', value: formatPct(aggregate.savingsRate, false) },
      ];
    }
    case 'pace': {
      const forecast = monthForecast(doc, month, today);
      if (period === 'month' && forecast) {
        return [
          { label: 'Рутина с начала месяца', value: formatRub(monthSummary(doc, month, today).routineToDate) },
          { label: 'Прогноз до конца месяца', value: formatRub(forecast.forecast) },
          { label: 'Осталось дней', value: String(forecast.daysLeft) },
        ];
      }
      const routine = months.reduce((sum, m) => sum + variableFlow(doc, m, today).routineExpense, 0);
      const oneOff = months.reduce((sum, m) => sum + variableFlow(doc, m, today).oneOffExpense, 0);
      return [
        { label: 'Рутина за период', value: formatRub(routine) },
        { label: 'Разовые за период', value: formatRub(oneOff) },
        { label: 'Дней в периоде', value: String(months.reduce((sum, m) => sum + daysInMonth(m), 0)) },
      ];
    }
    case 'struct': {
      const totals = months.reduce(
        (acc, m) => {
          const summary = monthSummary(doc, m, today);
          return {
            fixed: acc.fixed + summary.fixedExpense,
            routine: acc.routine + summary.routineExpense,
            oneOff: acc.oneOff + summary.oneOffExpense,
          };
        },
        { fixed: 0, routine: 0, oneOff: 0 },
      );
      return [
        { label: 'Постоянные', value: formatRub(totals.fixed) },
        { label: 'Рутина', value: formatRub(totals.routine) },
        { label: 'Разовые', value: formatRub(totals.oneOff) },
      ];
    }
    case 'oneoff': {
      const analysis = oneOffAnalysis(doc, month, today, doc.settings.oneOffWindow);
      return [
        { label: `Разовые в ${monthShort(month)}`, value: formatRub(analysis.current) },
        { label: 'Обычный месяц', value: analysis.avg === null ? '—' : formatRub(analysis.avg) },
        {
          label: 'Разница с обычным',
          value: analysis.delta === null ? '—' : formatSignedRub(analysis.delta),
        },
      ];
    }
    case 'runway': {
      const data = runway(doc, month, today);
      return [
        { label: 'Накоплено', value: formatRub(data.accumulated) },
        {
          label: 'Типичный месяц',
          value: data.typicalMonthCost === null ? '—' : formatRub(data.typicalMonthCost),
        },
        { label: 'Обязательный минимум', value: formatRub(monthSummary(doc, month, today).costOfLiving) },
      ];
    }
    case 'where': {
      const view = breakdownOf(doc, months, 'category');
      const kinds = breakdownOf(doc, months, 'kind');
      const fixedShare = kinds.rows.find((row) => row.key === 'FIXED')?.share ?? 0;
      return [
        { label: 'Всего трат', value: formatRub(view.total) },
        { label: 'Операций', value: String(view.rows.reduce((sum, row) => sum + row.count, 0)) },
        { label: 'Доля постоянных', value: formatPct(fixedShare, false) },
      ];
    }
    default:
      return [];
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
