/**
 * Агрегация по кварталам и годам. Раздел 2.13.
 *
 * Период — список месяцев. Все суммы складываются помесячно,
 * ничего не пересчитывается заново.
 */

import { compareMonth, monthKeyOf, monthOf, yearOf } from '../domain/dates';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { monthSummary } from './summary';

export interface PeriodSummary {
  months: MonthKey[];
  free: Money;
  net: Money;
  variableExpense: Money;
  totalIncome: Money;
  /**
   * Отношение сумм, а не среднее из месячных ставок: среднее из процентов
   * даёт неверный ответ при разных доходах.
   */
  savingsRate: number | null;
  /** В периоде есть незавершённый месяц — он входит по факту на сегодня */
  incomplete: boolean;
}

export function periodSummary(doc: BudgetDocument, months: MonthKey[], today: DateStr): PeriodSummary {
  const current = monthKeyOf(today);
  let free = 0;
  let net = 0;
  let variableExpense = 0;
  let totalIncome = 0;
  let incomplete = false;

  for (const month of months) {
    const summary = monthSummary(doc, month, today);
    free += summary.free;
    net += summary.net;
    variableExpense += summary.variableExpense;
    totalIncome += summary.totalIncome;
    if (compareMonth(month, current) >= 0) incomplete = true;
  }

  return {
    months,
    free,
    net,
    variableExpense,
    totalIncome,
    savingsRate: totalIncome === 0 ? null : net / totalIncome,
    incomplete,
  };
}

/** Месяцы квартала, в который попадает month. */
export function quarterMonths(month: MonthKey): MonthKey[] {
  const year = yearOf(month);
  const first = Math.floor((monthOf(month) - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(first + i).padStart(2, '0')}`);
}

/** Месяцы года, в который попадает month. */
export function yearMonths(month: MonthKey): MonthKey[] {
  const year = yearOf(month);
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

/** Период обрезается по границам учёта: месяцев раньше firstMonth и позже текущего не показываем. */
export function clampToHistory(doc: BudgetDocument, months: MonthKey[], today: DateStr): MonthKey[] {
  const current = monthKeyOf(today);
  return months.filter(
    (m) => compareMonth(m, doc.settings.firstMonth) >= 0 && compareMonth(m, current) <= 0,
  );
}
