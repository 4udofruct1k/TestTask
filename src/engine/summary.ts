/**
 * Свод месяца. Раздел 2.5.
 */

import { monthKeyOf } from '../domain/dates';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { fixedBlock } from './fixed';
import { variableFlow } from './expenses';

export interface MonthSummary {
  month: MonthKey;
  isCurrent: boolean;

  fixedIncome: Money;
  fixedExpense: Money;
  /** Часть fixedExpense: доли годовых платежей */
  reserved: Money;
  /** fixedIncome − fixedExpense */
  free: Money;

  variableIncome: Money;
  routineExpense: Money;
  oneOffExpense: Money;
  variableExpense: Money;
  /** Только для текущего месяца имеет смысл: в прошедшем совпадает с полной суммой */
  routineToDate: Money;
  oneOffToDate: Money;

  /** fixedExpense + routineExpense — минимум, в который обходится месяц */
  costOfLiving: Money;
  /** costOfLiving + oneOffExpense — факт этого месяца */
  monthCost: Money;
  totalIncome: Money;
  /** free + variableIncome − variableExpense */
  net: Money;
  /** net / totalIncome. Может быть отрицательным — это перерасход, не ошибка */
  savingsRate: number | null;
}

export function monthSummary(doc: BudgetDocument, month: MonthKey, today: DateStr): MonthSummary {
  const fixed = fixedBlock(doc, month);
  const variable = variableFlow(doc, month, today);

  const costOfLiving = fixed.fixedExpense + variable.routineExpense;
  const totalIncome = fixed.fixedIncome + variable.variableIncome;
  const net = fixed.free + variable.variableIncome - variable.variableExpense;

  return {
    month,
    isCurrent: month === monthKeyOf(today),

    fixedIncome: fixed.fixedIncome,
    fixedExpense: fixed.fixedExpense,
    reserved: fixed.reserved,
    free: fixed.free,

    variableIncome: variable.variableIncome,
    routineExpense: variable.routineExpense,
    oneOffExpense: variable.oneOffExpense,
    variableExpense: variable.variableExpense,
    routineToDate: variable.routineToDate,
    oneOffToDate: variable.oneOffToDate,

    costOfLiving,
    monthCost: costOfLiving + variable.oneOffExpense,
    totalIncome,
    net,
    savingsRate: totalIncome === 0 ? null : net / totalIncome,
  };
}
