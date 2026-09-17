/**
 * Переменный поток. Раздел 2.4.
 *
 * Операции с датой в будущем входят в месячные суммы, но не в ...ToDate
 * и не в расчёт темпа: иначе одна запланированная покупка ломает дневной темп.
 */

import { compareDate } from '../domain/dates';
import type { BudgetDocument, Category, DateStr, Expense, Flow, Money, MonthKey } from '../domain/types';
import { indexOf } from './context';

export interface VariableFlow {
  routineExpense: Money;
  oneOffExpense: Money;
  variableExpense: Money;
  variableIncome: Money;
  routineToDate: Money;
  oneOffToDate: Money;
  /** Число разовых покупок месяца — для подписи «3 покупки» */
  oneOffCount: number;
  routineCount: number;
}

export function expensesOfMonth(doc: BudgetDocument, month: MonthKey): Expense[] {
  return indexOf(doc).expensesByMonth.get(month) ?? [];
}

export function categoryOf(doc: BudgetDocument, expense: Expense): Category | undefined {
  return indexOf(doc).categories.get(expense.categoryId);
}

/**
 * Итоговый вид потока операции: flow ?? category.defaultFlow (1.3, инвариант 5).
 * У доходов поток не определён — null.
 */
export function flowOf(doc: BudgetDocument, expense: Expense): Flow | null {
  const category = categoryOf(doc, expense);
  if (!category || category.kind === 'INCOME') return null;
  return expense.flow ?? category.defaultFlow;
}

export function variableFlow(doc: BudgetDocument, month: MonthKey, today: DateStr): VariableFlow {
  let routineExpense = 0;
  let oneOffExpense = 0;
  let variableIncome = 0;
  let routineToDate = 0;
  let oneOffToDate = 0;
  let oneOffCount = 0;
  let routineCount = 0;

  for (const expense of expensesOfMonth(doc, month)) {
    const flow = flowOf(doc, expense);
    if (flow === null) {
      variableIncome += expense.amount;
      continue;
    }
    const toDate = compareDate(expense.date, today) <= 0;
    if (flow === 'ROUTINE') {
      routineExpense += expense.amount;
      routineCount += 1;
      if (toDate) routineToDate += expense.amount;
    } else {
      oneOffExpense += expense.amount;
      oneOffCount += 1;
      if (toDate) oneOffToDate += expense.amount;
    }
  }

  return {
    routineExpense,
    oneOffExpense,
    variableExpense: routineExpense + oneOffExpense,
    variableIncome,
    routineToDate,
    oneOffToDate,
    oneOffCount,
    routineCount,
  };
}

/** Разовые покупки месяца, отдельным списком: их видно на кривой метками. */
export function oneOffExpenses(doc: BudgetDocument, month: MonthKey): Expense[] {
  return expensesOfMonth(doc, month).filter((e) => flowOf(doc, e) === 'ONE_OFF');
}

export function routineExpenses(doc: BudgetDocument, month: MonthKey): Expense[] {
  return expensesOfMonth(doc, month).filter((e) => flowOf(doc, e) === 'ROUTINE');
}

export function incomeExpenses(doc: BudgetDocument, month: MonthKey): Expense[] {
  return expensesOfMonth(doc, month).filter((e) => flowOf(doc, e) === null);
}
