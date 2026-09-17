/**
 * Темп и прогноз. Раздел 2.8. Считается только для текущего месяца:
 * для прошедших есть факт, прогноз в них бессмыслен.
 */

import { addMonths, compareMonth, dayOfMonth, daysInMonth, monthKeyOf } from '../domain/dates';
import { toMoney } from '../domain/money';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { variableFlow } from './expenses';
import { fixedBlock } from './fixed';

/** Окно обычного темпа из 2.8. В отличие от окна разовых, настройкой не является. */
export const USUAL_DAILY_WINDOW = 6;
/** Меньше трёх полных месяцев — сравнивать не с чем (2.8). */
export const MIN_HISTORY_MONTHS = 3;

export interface MonthForecast {
  day: number;
  /** daysInMonth − day + 1, сегодня включительно */
  daysLeft: number;
  /** Копеек в день. Не деньги: результат деления (2.1) */
  routinePace: number;
  routineForecast: Money;
  /** routineForecast + разовые месяца целиком */
  forecast: Money;
  netForecast: Money;
  /** day >= settings.forecastMinDay. Ниже порога прогноз не показывается */
  visible: boolean;
}

/** null — месяц не текущий. */
export function monthForecast(doc: BudgetDocument, month: MonthKey, today: DateStr): MonthForecast | null {
  if (month !== monthKeyOf(today)) return null;

  const day = dayOfMonth(today);
  const days = daysInMonth(month);
  const variable = variableFlow(doc, month, today);
  const fixed = fixedBlock(doc, month);

  const routinePace = variable.routineToDate / day;
  const routineForecast = toMoney(routinePace * days);
  // Разовые добавляются как есть, полной суммой за месяц, включая операции
  // с будущей датой: они известны и повторяться не будут
  const forecast = routineForecast + variable.oneOffExpense;

  return {
    day,
    daysLeft: days - day + 1,
    routinePace,
    routineForecast,
    forecast,
    netForecast: fixed.free + variable.variableIncome - forecast,
    visible: day >= doc.settings.forecastMinDay,
  };
}

/** Полные месяцы истории: от firstMonth до месяца перед текущим включительно. */
export function completeMonths(doc: BudgetDocument, today: DateStr): MonthKey[] {
  const last = addMonths(monthKeyOf(today), -1);
  const first = doc.settings.firstMonth;
  if (compareMonth(first, last) > 0) return [];
  const out: MonthKey[] = [];
  for (let m = first; compareMonth(m, last) <= 0; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Средняя рутина в день за месяц. Результат деления, не деньги. */
export function dailyRoutine(doc: BudgetDocument, month: MonthKey, today: DateStr): number {
  return variableFlow(doc, month, today).routineExpense / daysInMonth(month);
}

/**
 * Обычный темп — медиана dailyRoutine по последним полным месяцам.
 *
 * Медиана, а не среднее, и это сознательно противоположно решению в 2.12:
 * здесь выброс это поведение (переезд, отпуск), он не должен поднимать планку.
 */
export function usualDaily(
  doc: BudgetDocument,
  today: DateStr,
  window: number = USUAL_DAILY_WINDOW,
): number | null {
  const months = completeMonths(doc, today).slice(-window);
  if (months.length === 0) return null;
  const values = months.map((m) => dailyRoutine(doc, m, today)).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
}

/**
 * Сколько отложится сверху при возврате к обычному темпу.
 * Показывается только при выполнении всех условий 2.8 — их проверяет вызывающий слой.
 */
export function potentialExtra(routinePace: number, usual: number, daysLeft: number): Money {
  return toMoney((routinePace - usual) * daysLeft);
}

/** Достаточно ли истории для сравнения с обычным темпом (2.8). */
export function hasEnoughHistory(doc: BudgetDocument, today: DateStr): boolean {
  return completeMonths(doc, today).length >= MIN_HISTORY_MONTHS;
}
