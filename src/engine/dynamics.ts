/**
 * Динамика внутри месяца и сравнение с прошлым. Разделы 2.6 и 2.7.
 *
 * Кривая строится только по рутинным тратам: одна покупка за 60 000 даёт
 * вертикальную ступеньку, после которой форма кривой ничего не говорит
 * о том, как идут обычные траты.
 */

import { addMonths, compareDate, compareMonth, dayOfMonth, daysInMonth, monthKeyOf } from '../domain/dates';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { routineExpenses } from './expenses';

export interface MonthComparison {
  cutoffDay: number;
  current: Money;
  previous: Money | null;
  /** В прошлом месяце дней меньше cutoffDay — взят последний день */
  previousTruncated: boolean;
  delta: Money | null;
  deltaPct: number | null;
}

/**
 * Накопленная рутина по дням. Длина = число дней месяца.
 * Для текущего месяца дни после сегодняшнего — null, а не ноль:
 * ноль означал бы «в этот день не тратил», null — «день ещё не наступил».
 */
export function cumulativeByDay(doc: BudgetDocument, month: MonthKey, today: DateStr): (Money | null)[] {
  const days = daysInMonth(month);
  const perDay = new Array<number>(days).fill(0);

  for (const expense of routineExpenses(doc, month)) {
    const index = dayOfMonth(expense.date) - 1;
    perDay[index] = (perDay[index] ?? 0) + expense.amount;
  }

  const out: (Money | null)[] = [];
  let acc = 0;
  for (let day = 1; day <= days; day++) {
    acc += perDay[day - 1] ?? 0;
    const date = dateOf(month, day);
    out.push(compareDate(date, today) <= 0 ? acc : null);
  }
  return out;
}

/** Сумма рутины месяца по дням не позже day включительно. */
export function routineUpToDay(doc: BudgetDocument, month: MonthKey, day: number): Money {
  let sum = 0;
  for (const expense of routineExpenses(doc, month)) {
    if (dayOfMonth(expense.date) <= day) sum += expense.amount;
  }
  return sum;
}

/**
 * Сравнение с прошлым месяцем по одному и тому же номеру дня.
 * Неполный месяц никогда не сравнивается с полным — иначе 16 марта
 * всегда выглядит экономией относительно целого февраля.
 */
export function compareToPrevious(doc: BudgetDocument, month: MonthKey, today: DateStr): MonthComparison {
  const isCurrent = month === monthKeyOf(today);
  const cutoffDay = isCurrent ? dayOfMonth(today) : daysInMonth(month);
  const current = routineUpToDay(doc, month, cutoffDay);

  const previousMonth = addMonths(month, -1);
  if (compareMonth(previousMonth, doc.settings.firstMonth) < 0) {
    // Прошлого месяца нет в истории — блок сравнения скрывается
    return { cutoffDay, current, previous: null, previousTruncated: false, delta: null, deltaPct: null };
  }

  const previousDays = daysInMonth(previousMonth);
  const previousTruncated = previousDays < cutoffDay;
  const previous = routineUpToDay(doc, previousMonth, Math.min(cutoffDay, previousDays));

  const delta = current - previous;
  // previous === 0 → процент не считается: деление на ноль не маскируется бесконечностью
  const deltaPct = previous === 0 ? null : delta / previous;

  return { cutoffDay, current, previous, previousTruncated, delta, deltaPct };
}

function dateOf(month: MonthKey, day: number): DateStr {
  return `${month}-${String(day).padStart(2, '0')}`;
}
