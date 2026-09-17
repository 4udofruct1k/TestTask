/**
 * Индексы документа. Раздел 4.8: строятся один раз и переиспользуются.
 *
 * Кэш висит на объекте документа. Мутации в store делают новый объект,
 * поэтому устаревший индекс отдать невозможно.
 */

import { compareDate } from '../domain/dates';
import type { BudgetDocument, Category, Expense, MonthKey, MonthOverride } from '../domain/types';
import { monthKeyOf } from '../domain/dates';

export interface DocIndex {
  categories: Map<string, Category>;
  expensesByMonth: Map<MonthKey, Expense[]>;
  /** Ключ `${month}:${fixedItemId}` */
  overrides: Map<string, MonthOverride>;
}

const cache = new WeakMap<BudgetDocument, DocIndex>();

export function indexOf(doc: BudgetDocument): DocIndex {
  const cached = cache.get(doc);
  if (cached) return cached;

  const categories = new Map(doc.categories.map((c) => [c.id, c]));

  const expensesByMonth = new Map<MonthKey, Expense[]>();
  for (const expense of doc.expenses) {
    const month = monthKeyOf(expense.date);
    const list = expensesByMonth.get(month);
    if (list) list.push(expense);
    else expensesByMonth.set(month, [expense]);
  }
  // Внутри месяца — по (date, createdAt). createdAt только tie-breaker
  for (const list of expensesByMonth.values()) {
    list.sort((a, b) => compareDate(a.date, b.date) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  }

  const overrides = new Map<string, MonthOverride>();
  for (const o of doc.overrides) overrides.set(overrideKey(o.month, o.fixedItemId), o);

  const index: DocIndex = { categories, expensesByMonth, overrides };
  cache.set(doc, index);
  return index;
}

export function overrideKey(month: MonthKey, fixedItemId: string): string {
  return `${month}:${fixedItemId}`;
}
