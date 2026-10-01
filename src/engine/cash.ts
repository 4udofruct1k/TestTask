/**
 * Деньги месяца по факту на сегодня. Раздел 2.14.
 *
 * Сводка месяца (2.5) — это план: постоянная позиция входит в месяц целиком
 * с первого числа. Здесь — то, что уже случилось: зарплата с числом 5-е
 * первого октября ещё не пришла, аренда с числом 10-е ещё не ушла, трата
 * с завтрашней датой ещё не потрачена.
 *
 * Позиция без числа считается случившейся с первого числа, как раньше:
 * выдумывать ей дату нельзя. Доли годовых платежей — тоже с первого числа:
 * они не уходят с карты, но и свободными эти деньги не назвать.
 */

import { compareDate, compareMonth, monthKeyOf } from '../domain/dates';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { expensesOfMonth, flowOf } from './expenses';
import { fixedProgress } from './schedule';
import { monthSummary } from './summary';

export interface MonthCash {
  /** Пришло: постоянный доход по наступившим числам и без числа, разовые доходы по сегодня */
  received: Money;
  /** Ушло: постоянные расходы по наступившим числам и без числа, доли годовых, траты по сегодня */
  paid: Money;
  /** Ещё придёт в этом месяце */
  pendingIncome: Money;
  /** Ещё уйдёт в этом месяце */
  pendingExpense: Money;
  /** received − paid */
  net: Money;
  /** Ближайший приход, если что-то ещё впереди */
  nextIncomeDate: DateStr | null;
}

export function monthCash(doc: BudgetDocument, month: MonthKey, today: DateStr): MonthCash {
  const order = compareMonth(month, monthKeyOf(today));

  // Закрытый месяц случился целиком, будущий — не случился вовсе
  if (order !== 0) {
    const summary = monthSummary(doc, month, today);
    const done = order < 0;
    return {
      received: done ? summary.totalIncome : 0,
      paid: done ? summary.monthCost : 0,
      pendingIncome: done ? 0 : summary.totalIncome,
      pendingExpense: done ? 0 : summary.monthCost,
      net: done ? summary.net : 0,
      nextIncomeDate: null,
    };
  }

  const fixed = fixedProgress(doc, month, today);
  let received = fixed.income.done + fixed.income.undated;
  let paid = fixed.expense.done + fixed.expense.undated;
  let pendingIncome = fixed.income.ahead;
  let pendingExpense = fixed.expense.ahead;
  let nextIncomeDate = fixed.events.find((event) => event.kind === 'INCOME' && !event.done)?.date ?? null;

  for (const expense of expensesOfMonth(doc, month)) {
    const happened = compareDate(expense.date, today) <= 0;
    // flowOf возвращает null у доходов (1.3, инвариант 6)
    if (flowOf(doc, expense) === null) {
      if (happened) received += expense.amount;
      else {
        pendingIncome += expense.amount;
        if (nextIncomeDate === null || compareDate(expense.date, nextIncomeDate) < 0) {
          nextIncomeDate = expense.date;
        }
      }
    } else if (happened) {
      paid += expense.amount;
    } else {
      pendingExpense += expense.amount;
    }
  }

  return { received, paid, pendingIncome, pendingExpense, net: received - paid, nextIncomeDate };
}
