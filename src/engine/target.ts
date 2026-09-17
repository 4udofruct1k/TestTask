/**
 * Вписываемся ли в цель по накоплению. Раздел 2.9.
 *
 * Цель — ориентир для расчёта допустимых трат, а не денежная операция:
 * в free, net и балансы она не входит (1.6).
 */

import { compareMonth, dayOfMonth, daysInMonth, monthKeyOf } from '../domain/dates';
import { toMoney } from '../domain/money';
import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { variableFlow } from './expenses';
import { fixedBlock } from './fixed';
import { monthForecast } from './forecast';

export type TargetState = 'IMPOSSIBLE' | 'BROKEN' | 'AT_RISK' | 'ON_TRACK' | 'AHEAD';

export interface TargetStatus {
  /** Цель по накоплению на месяц */
  target: Money;
  /** free + variableIncome − target: сколько можно потратить, чтобы цель выполнилась */
  budget: Money;
  /** routineToDate + oneOffToDate */
  spent: Money;
  /** spent + разовые с датой позже сегодня */
  committed: Money;
  remaining: Money;
  /** daysInMonth − day + 1, сегодня включительно */
  daysLeft: number;
  dailyAllowance: Money | null;
  state: TargetState;
}

/** Разрешение версионной цели на месяц: последняя запись с fromMonth <= month (1.6). */
export function targetAt(doc: BudgetDocument, month: MonthKey): Money | null {
  let found: Money | null = null;
  for (const entry of doc.settings.targets) {
    if (compareMonth(entry.fromMonth, month) <= 0) found = entry.amount;
    else break;
  }
  return found;
}

/** null — цель не задана. */
export function targetStatus(doc: BudgetDocument, month: MonthKey, today: DateStr): TargetStatus | null {
  const target = targetAt(doc, month);
  if (target === null) return null;

  const fixed = fixedBlock(doc, month);
  const variable = variableFlow(doc, month, today);
  const forecast = monthForecast(doc, month, today);

  const budget = fixed.free + variable.variableIncome - target;
  const spent = variable.routineToDate + variable.oneOffToDate;
  // Разовые с будущей датой уже обещаны: они входят в committed целиком,
  // ровно как и в forecast (2.8). Будущая рутина ни туда, ни туда не идёт.
  const committed = variable.routineToDate + variable.oneOffExpense;
  const remaining = budget - committed;

  const isCurrent = month === monthKeyOf(today);
  const daysLeft = isCurrent ? daysInMonth(month) - dayOfMonth(today) + 1 : 0;
  const dailyAllowance = daysLeft > 0 ? toMoney(remaining / daysLeft) : null;

  return {
    target,
    budget,
    spent,
    committed,
    remaining,
    daysLeft,
    dailyAllowance,
    state: resolveState(budget, committed, forecast?.visible ? forecast.forecast : null),
  };
}

/** Порядок разрешения строго по таблице 2.9. */
function resolveState(budget: Money, committed: Money, forecast: Money | null): TargetState {
  // Цель недостижима даже при нулевых тратах
  if (budget <= 0) return 'IMPOSSIBLE';
  // Уже перетрачено или обещано
  if (committed > budget) return 'BROKEN';
  // Ниже порога достоверности прогноза AT_RISK и AHEAD не вычисляются
  if (forecast !== null) {
    if (forecast > budget) return 'AT_RISK';
    if (forecast <= budget * 0.9) return 'AHEAD';
  }
  return 'ON_TRACK';
}
