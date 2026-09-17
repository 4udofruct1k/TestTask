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
  /** Сумма, которая идёт в расчёты: начислено минус удержано */
  amount: Money;
  /** Начислено, до удержания налога. Без вычета совпадает с amount */
  gross: Money;
  /** Удержано с этой позиции. 0, если вычет не включён */
  tax: Money;
  overridden: boolean;
  /** mode === 'SPREAD': доля годового платежа, а не отдельные деньги */
  isReserve: boolean;
}

export interface FixedBlock {
  items: ResolvedFixed[];
  /** Постоянный доход после удержаний — то, что доходит до кошелька */
  fixedIncome: Money;
  /** Начислено до удержаний. Без вычетов совпадает с fixedIncome */
  fixedIncomeGross: Money;
  /** Удержано налогов за месяц. Не расход: эти деньги не приходили */
  taxWithheld: Money;
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
 * Начисленная сумма позиции на месяц, до удержания налога.
 * null — позиция в этом месяце не действует.
 *
 * Остаток от деления в SPREAD уходит в последний месяц цикла, а не
 * размазывается: иначе сумма долей не сойдётся с платежом (1.4).
 */
export function grossAmountAt(item: FixedItem, month: MonthKey): Money | null {
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

/**
 * Удержание с начисленной суммы. Ноль, если вычет не включён или
 * позиция не доходная: с расхода налог не удерживают.
 */
export function taxOn(item: FixedItem, gross: Money): Money {
  if (item.kind !== 'INCOME' || item.taxPercent === undefined) return 0;
  return Math.round((gross * item.taxPercent) / 100);
}

/**
 * Сумма позиции на месяц после удержания — она и участвует во всех расчётах.
 * null — позиция в этом месяце не действует.
 *
 * Налог вычитается здесь, а не отдельной позицией расхода: иначе сумма
 * и удержание с неё разъехались бы при первой же правке оклада.
 */
export function amountAt(item: FixedItem, month: MonthKey): Money | null {
  const gross = grossAmountAt(item, month);
  return gross === null ? null : gross - taxOn(item, gross);
}

/** Разрешение фиксированного блока на месяц с учётом оверрайдов (2.3). */
export function resolveFixed(doc: BudgetDocument, month: MonthKey): ResolvedFixed[] {
  const { overrides } = indexOf(doc);
  const out: ResolvedFixed[] = [];

  for (const item of doc.fixedItems) {
    const base = grossAmountAt(item, month);
    if (base === null) continue;

    const override = overrides.get(overrideKey(month, item.id));
    // Оверрайд с null — позиция исключается из месяца целиком
    if (override && override.amount === null) continue;

    // Оверрайд задаёт начисленную сумму: позиция хранится до удержания,
    // и налог считается от того, что в этом месяце начислено
    const gross = override ? override.amount! : base;
    const tax = taxOn(item, gross);

    out.push({
      itemId: item.id,
      title: item.title,
      kind: item.kind,
      categoryId: item.categoryId,
      amount: gross - tax,
      gross,
      tax,
      overridden: override !== undefined,
      isReserve: item.mode === 'SPREAD',
    });
  }

  return out;
}

export function fixedBlock(doc: BudgetDocument, month: MonthKey): FixedBlock {
  const items = resolveFixed(doc, month);
  let fixedIncome = 0;
  let fixedIncomeGross = 0;
  let taxWithheld = 0;
  let fixedExpense = 0;
  let reserved = 0;

  for (const item of items) {
    if (item.kind === 'INCOME') {
      fixedIncome += item.amount;
      fixedIncomeGross += item.gross;
      taxWithheld += item.tax;
    } else {
      fixedExpense += item.amount;
      if (item.isReserve) reserved += item.amount;
    }
  }

  return {
    items,
    fixedIncome,
    fixedIncomeGross,
    taxWithheld,
    fixedExpense,
    reserved,
    free: fixedIncome - fixedExpense,
  };
}

/** Действовала ли позиция хоть в одном месяце диапазона — для запрета удаления (1.4, инвариант 8). */
export function wasActiveBefore(item: FixedItem, month: MonthKey): boolean {
  const first = item.mode === 'MONTHLY' ? item.amounts[0] : item.spreads[0];
  if (!first) return false;
  return compareMonth(first.fromMonth, month) < 0;
}
