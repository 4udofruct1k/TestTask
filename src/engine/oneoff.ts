/**
 * Анализ разовых трат. Раздел 2.12.
 *
 * Разовые рваные по природе: в феврале ноль, в марте 24 000. Прямая дельта
 * месяц к месяцу на таком ряде даёт бессмысленный ответ, поэтому базой
 * служит скользящее среднее.
 */

import { addMonths, compareMonth, monthKeyOf } from '../domain/dates';
import { toMoney } from '../domain/money';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { MIN_HISTORY_MONTHS } from './forecast';
import { completeMonths } from './forecast';
import { flowOf, expensesOfMonth, variableFlow } from './expenses';

export interface OneOffMonth {
  month: MonthKey;
  amount: Money;
  count: number;
}

export interface OneOffCategory {
  categoryId: string;
  amount: Money;
  count: number;
}

export interface OneOffAnalysis {
  current: Money;
  count: number;
  /** Скользящее среднее за window полных месяцев. null при истории меньше трёх */
  avg: Money | null;
  delta: Money | null;
  deltaPct: number | null;
  /** Окно плюс анализируемый месяц, по возрастанию — столбцы графика */
  byMonth: OneOffMonth[];
  /** Категории разовых анализируемого месяца, по убыванию суммы */
  topCategories: OneOffCategory[];
  monthIncomplete: boolean;
  insufficientHistory: boolean;
}

export function oneOffAnalysis(
  doc: BudgetDocument,
  month: MonthKey,
  today: DateStr,
  window = 6,
): OneOffAnalysis {
  const current = variableFlow(doc, month, today);

  // Текущий месяц в окно не входит: иначе он сравнивается сам с собой
  const windowMonths: MonthKey[] = [];
  for (let i = window; i >= 1; i--) {
    const m = addMonths(month, -i);
    if (compareMonth(m, doc.settings.firstMonth) >= 0) windowMonths.push(m);
  }

  const byMonth: OneOffMonth[] = [...windowMonths, month].map((m) => {
    const flow = variableFlow(doc, m, today);
    return { month: m, amount: flow.oneOffExpense, count: flow.oneOffCount };
  });

  const insufficientHistory = completeMonths(doc, today).length < MIN_HISTORY_MONTHS;

  // Среднее, а не медиана: выброс здесь не шум, а реальные деньги,
  // и для планирования средняя нагрузка обязана учитывать дорогие месяцы
  let avg: Money | null = null;
  if (!insufficientHistory && windowMonths.length > 0) {
    const sum = windowMonths.reduce((acc, m) => acc + variableFlow(doc, m, today).oneOffExpense, 0);
    avg = toMoney(sum / windowMonths.length);
  }

  const delta = avg === null ? null : current.oneOffExpense - avg;
  const deltaPct = avg === null || avg === 0 || delta === null ? null : delta / avg;

  return {
    current: current.oneOffExpense,
    count: current.oneOffCount,
    avg,
    delta,
    deltaPct,
    byMonth,
    topCategories: topCategories(doc, month),
    // Обрезка по дню здесь не применяется: покупка 28-го так же вероятна, как 3-го
    monthIncomplete: month === monthKeyOf(today),
    insufficientHistory,
  };
}

function topCategories(doc: BudgetDocument, month: MonthKey): OneOffCategory[] {
  const acc = new Map<string, OneOffCategory>();
  for (const expense of expensesOfMonth(doc, month)) {
    if (flowOf(doc, expense) !== 'ONE_OFF') continue;
    const entry = acc.get(expense.categoryId);
    if (entry) {
      entry.amount += expense.amount;
      entry.count += 1;
    } else {
      acc.set(expense.categoryId, { categoryId: expense.categoryId, amount: expense.amount, count: 1 });
    }
  }
  return [...acc.values()].sort((a, b) => b.amount - a.amount);
}
