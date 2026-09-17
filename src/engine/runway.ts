/**
 * Типичный месяц и запас прочности. Раздел 2.12.
 */

import { addMonths, compareMonth, monthKeyOf } from '../domain/dates';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { monthSummary } from './summary';
import { oneOffAnalysis } from './oneoff';

export interface Runway {
  /** costOfLiving + среднее по разовым. Прогнозная величина, не факт месяца */
  typicalMonthCost: Money | null;
  /** startingBalance + Σ net с firstMonth. Не остаток на счетах: «по данным учёта» */
  accumulated: Money;
  runwayMonths: number | null;
}

/** Все месяцы учёта: от firstMonth до текущего включительно. */
export function accountedMonths(doc: BudgetDocument, today: DateStr): MonthKey[] {
  const last = monthKeyOf(today);
  const first = doc.settings.firstMonth;
  if (compareMonth(first, last) > 0) return [];
  const out: MonthKey[] = [];
  for (let m = first; compareMonth(m, last) <= 0; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function accumulated(doc: BudgetDocument, today: DateStr): Money {
  let sum = doc.settings.startingBalance;
  for (const month of accountedMonths(doc, today)) sum += monthSummary(doc, month, today).net;
  return sum;
}

/** Накопленное на конец месяца: стартовая сумма плюс net с firstMonth по month. */
export function accumulatedAt(doc: BudgetDocument, month: MonthKey, today: DateStr): Money {
  let sum = doc.settings.startingBalance;
  for (const m of accountedMonths(doc, today)) {
    if (compareMonth(m, month) > 0) break;
    sum += monthSummary(doc, m, today).net;
  }
  return sum;
}

export function runway(doc: BudgetDocument, month: MonthKey, today: DateStr): Runway {
  const summary = monthSummary(doc, month, today);
  const analysis = oneOffAnalysis(doc, month, today, doc.settings.oneOffWindow);

  // Минимумом жизнь не ограничивается: что-то разовое случается почти каждый месяц
  const typicalMonthCost = analysis.avg === null ? null : summary.costOfLiving + analysis.avg;
  const saved = accumulated(doc, today);

  return {
    typicalMonthCost,
    accumulated: saved,
    runwayMonths: typicalMonthCost !== null && typicalMonthCost > 0 ? saved / typicalMonthCost : null,
  };
}
