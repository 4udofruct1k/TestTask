/**
 * Прогресс цели-накопления. Раздел 2.10.
 *
 * Взнос в цель — не трата: net он не уменьшает (1.7).
 */

import { compareMonth, monthKeyOf, monthsBetween } from '../domain/dates';
import { toMoney } from '../domain/money';
import type { DateStr, Money, MonthKey, SavingsGoal } from '../domain/types';

export interface GoalProgress {
  saved: Money;
  remaining: Money;
  /** Может быть > 1: накопить больше цели не запрещено */
  pct: number;
  /** До deadline включительно от текущего месяца. 0 — срок прошёл */
  monthsLeft: number | null;
  requiredPerMonth: Money | null;
  /** По месяцам, в которых были взносы, а не по всем месяцам с создания */
  avgPerMonth: Money | null;
  projectedMonths: number | null;
  onSchedule: boolean | null;
}

export function goalProgress(goal: SavingsGoal, today: DateStr): GoalProgress {
  const current = monthKeyOf(today);

  let saved = 0;
  const months = new Set<MonthKey>();
  for (const contribution of goal.contributions) {
    saved += contribution.amount;
    months.add(contribution.month);
  }

  const remaining = Math.max(0, goal.targetAmount - saved);
  const pct = goal.targetAmount === 0 ? 0 : saved / goal.targetAmount;

  const monthsLeft =
    goal.deadline === undefined ? null : Math.max(0, monthsBetween(current, goal.deadline) + 1);
  // Срок прошёл — требуемого темпа больше нет, цель просрочена
  const requiredPerMonth = monthsLeft !== null && monthsLeft > 0 ? toMoney(remaining / monthsLeft) : null;

  // Один пропущенный месяц не должен занижать средний темп вдвое
  const avgPerMonth = months.size === 0 ? null : toMoney(saved / months.size);
  const projectedMonths = avgPerMonth !== null && avgPerMonth > 0 ? remaining / avgPerMonth : null;

  const onSchedule =
    requiredPerMonth === null || avgPerMonth === null ? null : avgPerMonth >= requiredPerMonth;

  return { saved, remaining, pct, monthsLeft, requiredPerMonth, avgPerMonth, projectedMonths, onSchedule };
}

/** Просрочена ли цель: срок задан и уже прошёл. */
export function isOverdue(goal: SavingsGoal, today: DateStr): boolean {
  if (goal.deadline === undefined) return false;
  return compareMonth(goal.deadline, monthKeyOf(today)) < 0;
}

/** Сумма взносов за месяц — для подсветки «взнос больше накопления» (1.7). */
export function contributionsOfMonth(goals: SavingsGoal[], month: MonthKey): Money {
  let sum = 0;
  for (const goal of goals) {
    for (const contribution of goal.contributions) {
      if (contribution.month === month) sum += contribution.amount;
    }
  }
  return sum;
}
