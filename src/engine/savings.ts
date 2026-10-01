/**
 * Накопления: сколько денег скопилось по данным учёта.
 *
 * Модель уже переносит остаток месяца в накопления — `net` каждого месяца
 * и есть то, что от него осталось, а бюджет следующего считается заново
 * от его собственного дохода (1.9). Не хватало только места, где эту кучу
 * видно: стартовая сумма до сих пор участвовала лишь в запасе прочности.
 *
 * Это по-прежнему не остаток на счетах: приложение не знает про реальные
 * счета и не делает вид, что знает (2.12).
 *
 * Текущий месяц входит по факту на сегодня (2.14), а не планом: зарплата,
 * которая придёт 5-го, первого числа в кучу ещё не легла.
 */

import { compareMonth, monthKeyOf } from '../domain/dates';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { monthCash } from './cash';
import { accountedMonths } from './runway';
import { monthSummary } from './summary';

export interface SavingsMonth {
  month: MonthKey;
  /** Остаток месяца, он же вклад в накопления */
  net: Money;
  /** Накоплено на конец этого месяца, со стартовой суммой */
  running: Money;
  /** Месяц ещё идёт: сумма изменится до его конца */
  current: boolean;
}

export interface SavingsLedger {
  startingBalance: Money;
  /** Σ остатков по закрытым месяцам */
  closed: Money;
  /** Остаток текущего месяца по факту на сегодня */
  current: Money;
  /** startingBalance + closed + current */
  total: Money;
  /**
   * Помечено во взносах активных целей. Взнос не трата и денег из кучи
   * не вынимает — он их метит (1.7), поэтому earmarked это часть total.
   */
  earmarked: Money;
  /** total − earmarked. Может быть отрицательным: пометить можно больше, чем есть */
  free: Money;
  /** История от новых месяцев к старым */
  months: SavingsMonth[];
}

export function savingsLedger(doc: BudgetDocument, today: DateStr): SavingsLedger {
  const currentMonth = monthKeyOf(today);
  const startingBalance = doc.settings.startingBalance;

  let closed = 0;
  let current = 0;
  let running = startingBalance;
  const months: SavingsMonth[] = [];

  for (const month of accountedMonths(doc, today)) {
    const isCurrent = compareMonth(month, currentMonth) >= 0;
    // Закрытый месяц — итогом, текущий — тем, что уже случилось
    const net = isCurrent ? monthCash(doc, month, today).net : monthSummary(doc, month, today).net;
    if (isCurrent) current += net;
    else closed += net;
    running += net;
    months.push({ month, net, running, current: isCurrent });
  }

  const total = startingBalance + closed + current;
  const earmarked = earmarkedTotal(doc);

  return {
    startingBalance,
    closed,
    current,
    total,
    earmarked,
    free: total - earmarked,
    months: months.reverse(),
  };
}

/**
 * Взносы активных целей. Архивированная цель из подсчёта уходит: её деньги
 * либо потрачены, либо цель снята, и метка на них больше не держится.
 * Сами взносы при этом остаются в истории цели (1.7, инвариант 4).
 */
export function earmarkedTotal(doc: BudgetDocument): Money {
  let sum = 0;
  for (const goal of doc.goals) {
    if (goal.archived) continue;
    for (const contribution of goal.contributions) sum += contribution.amount;
  }
  return sum;
}

/** Взносы активных копилок, сделанные в этом месяце. */
export function earmarkedIn(doc: BudgetDocument, month: MonthKey): Money {
  let sum = 0;
  for (const goal of doc.goals) {
    if (goal.archived) continue;
    for (const contribution of goal.contributions) {
      if (contribution.month === month) sum += contribution.amount;
    }
  }
  return sum;
}

/**
 * Свободные деньги на начало месяца: стартовая сумма и остатки закрытых
 * месяцев до него, без того, что к этому моменту лежит в активных копилках.
 * Месяцы до него закрыты, поэтому берутся итогом.
 */
export function carriedInto(doc: BudgetDocument, month: MonthKey, today: DateStr): Money {
  let sum = doc.settings.startingBalance;
  for (const m of accountedMonths(doc, today)) {
    if (compareMonth(m, month) >= 0) break;
    sum += monthSummary(doc, m, today).net;
  }
  for (const goal of doc.goals) {
    if (goal.archived) continue;
    for (const contribution of goal.contributions) {
      if (compareMonth(contribution.month, month) < 0) sum -= contribution.amount;
    }
  }
  return sum;
}
