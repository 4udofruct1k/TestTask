/**
 * Фиксированный блок. Разделы 1.4 и 2.3.
 */

import { compareMonth, monthsBetween } from '../domain/dates';
import type { AmountPeriod, BudgetDocument, FixedItem, Kind, Money, MonthKey, SpreadPeriod } from '../domain/types';
import { indexOf, overrideKey } from './context';

export interface ResolvedFixed {
  itemId: string;
  title: string;
  kind: Kind;
  categoryId: string;
  amount: Money;
  overridden: boolean;
  /** mode === 'SPREAD': доля годового платежа, а не отдельные деньги */
  isReserve: boolean;
}

export interface FixedBlock {
  items: ResolvedFixed[];
  fixedIncome: Money;
  fixedExpense: Money;
  /** Часть fixedExpense: доли годовых платежей */
  reserved: Money;
  /** fixedIncome − fixedExpense. Может быть отрицательным — это законно */
  free: Money;
}

/** Последняя запись с fromMonth <= month. null, если таких нет. */
function activePeriod<T extends { fromMonth: MonthKey }>(periods: T[], month: MonthKey): T | null {
  let found: T | null = null;
  for (const period of periods) {
    if (compareMonth(period.fromMonth, month) <= 0) found = period;
    else break;
  }
  return found;
}

export function activeAmountPeriod(item: FixedItem, month: MonthKey): AmountPeriod | null {
  return item.mode === 'MONTHLY' ? activePeriod(item.amounts, month) : null;
}

export function activeSpreadPeriod(item: FixedItem, month: MonthKey): SpreadPeriod | null {
  return item.mode === 'SPREAD' ? activePeriod(item.spreads, month) : null;
}

/**
 * Сумма позиции на месяц. null — позиция в этом месяце не действует.
 *
 * Остаток от деления в SPREAD уходит в последний месяц цикла, а не
 * размазывается: иначе сумма долей не сойдётся с платежом (1.4).
 */
export function amountAt(item: FixedItem, month: MonthKey): Money | null {
  if (item.endMonth !== undefined && compareMonth(month, item.endMonth) > 0) return null;

  if (item.mode === 'MONTHLY') {
    const period = activePeriod(item.amounts, month);
    return period ? period.amount : null;
  }

  const period = activePeriod(item.spreads, month);
  if (!period) return null;
  const i = monthsBetween(period.fromMonth, month) % period.months;
  const base = Math.floor(period.totalAmount / period.months);
  return i === period.months - 1 ? base + (period.totalAmount - base * period.months) : base;
}

/** Разрешение фиксированного блока на месяц с учётом оверрайдов (2.3). */
export function resolveFixed(doc: BudgetDocument, month: MonthKey): ResolvedFixed[] {
  const { overrides } = indexOf(doc);
  const out: ResolvedFixed[] = [];

  for (const item of doc.fixedItems) {
    const base = amountAt(item, month);
    if (base === null) continue;

    const override = overrides.get(overrideKey(month, item.id));
    // Оверрайд с null — позиция исключается из месяца целиком
    if (override && override.amount === null) continue;

    out.push({
      itemId: item.id,
      title: item.title,
      kind: item.kind,
      categoryId: item.categoryId,
      amount: override ? override.amount! : base,
      overridden: override !== undefined,
      isReserve: item.mode === 'SPREAD',
    });
  }

  return out;
}

export function fixedBlock(doc: BudgetDocument, month: MonthKey): FixedBlock {
  const items = resolveFixed(doc, month);
  let fixedIncome = 0;
  let fixedExpense = 0;
  let reserved = 0;

  for (const item of items) {
    if (item.kind === 'INCOME') fixedIncome += item.amount;
    else {
      fixedExpense += item.amount;
      if (item.isReserve) reserved += item.amount;
    }
  }

  return { items, fixedIncome, fixedExpense, reserved, free: fixedIncome - fixedExpense };
}

/** Действовала ли позиция хоть в одном месяце диапазона — для запрета удаления (1.4, инвариант 8). */
export function wasActiveBefore(item: FixedItem, month: MonthKey): boolean {
  const first = item.mode === 'MONTHLY' ? item.amounts[0] : item.spreads[0];
  if (!first) return false;
  return compareMonth(first.fromMonth, month) < 0;
}
