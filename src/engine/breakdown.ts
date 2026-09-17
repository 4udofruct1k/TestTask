/**
 * Разрез трат месяца: по категориям и по видам.
 *
 * Считается всё, во что месяц обошёлся: постоянные платежи плюс переменные
 * траты. Доходы сюда не входят — вопрос в том, куда деньги ушли.
 * Сумма любого из двух разрезов равна `monthCost` из 2.5.
 *
 * Сегодняшняя дата здесь не нужна: разрез берёт месяц целиком, а не долю
 * до сегодня. Поэтому параметра today у этих функций нет.
 */

import type { BudgetDocument, Money, MonthKey } from '../domain/types';
import { expensesOfMonth, flowOf } from './expenses';
import { resolveFixed } from './fixed';

export interface CategorySpend {
  categoryId: string;
  amount: Money;
  /** Операций за месяц; у постоянных — сколько позиций в этой категории */
  count: number;
}

/** Вид траты для разреза: постоянное, рутина, разовое. */
export type SpendKind = 'FIXED' | 'ROUTINE' | 'ONE_OFF';

export interface KindSpend {
  kind: SpendKind;
  amount: Money;
  count: number;
}

export function spendingByCategory(doc: BudgetDocument, month: MonthKey): CategorySpend[] {
  const acc = new Map<string, CategorySpend>();
  const add = (categoryId: string, amount: Money): void => {
    const entry = acc.get(categoryId);
    if (entry) {
      entry.amount += amount;
      entry.count += 1;
    } else {
      acc.set(categoryId, { categoryId, amount, count: 1 });
    }
  };

  for (const item of resolveFixed(doc, month)) {
    if (item.kind === 'EXPENSE') add(item.categoryId, item.amount);
  }
  for (const expense of expensesOfMonth(doc, month)) {
    // flowOf возвращает null у доходов — они не траты
    if (flowOf(doc, expense) !== null) add(expense.categoryId, expense.amount);
  }

  return [...acc.values()].sort((a, b) => b.amount - a.amount);
}

export function spendingByKind(doc: BudgetDocument, month: MonthKey): KindSpend[] {
  const acc: Record<SpendKind, KindSpend> = {
    FIXED: { kind: 'FIXED', amount: 0, count: 0 },
    ROUTINE: { kind: 'ROUTINE', amount: 0, count: 0 },
    ONE_OFF: { kind: 'ONE_OFF', amount: 0, count: 0 },
  };

  for (const item of resolveFixed(doc, month)) {
    if (item.kind !== 'EXPENSE') continue;
    acc.FIXED.amount += item.amount;
    acc.FIXED.count += 1;
  }
  for (const expense of expensesOfMonth(doc, month)) {
    const flow = flowOf(doc, expense);
    if (flow === null) continue;
    acc[flow].amount += expense.amount;
    acc[flow].count += 1;
  }

  // Порядок постоянный: он же задаёт цвет, и от состава месяца зависеть не должен
  return [acc.FIXED, acc.ROUTINE, acc.ONE_OFF];
}
