/**
 * Шкала месяца для блока бюджета на главной (3.2).
 *
 * «Осталось» — свободные деньги на сегодня: то, что было свободно к началу
 * месяца (стартовая сумма и остатки прошлых месяцев без копилок), плюс
 * пришедшее в этом месяце, минус ушедшее и отложенное в копилки. Это то же
 * самое число, что «свободно» на экране накоплений (2.16): одно понятие —
 * одна величина на всех экранах.
 *
 * Шкала — все деньги месяца: свободное к началу плюс весь доход месяца.
 * На ней три части: свободно сейчас, ещё придёт, ушло и отложено.
 * Сумма трёх частей — вся шкала, поэтому в день зарплаты заливка растёт,
 * а с каждой тратой убывает, как заряд.
 *
 * Цвет шкалы считается от `net` — плана месяца, а не от того, пришла ли уже
 * зарплата: первого числа месяц не провален только потому, что ещё рано.
 */

import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { monthCash } from './cash';
import { carriedInto, earmarkedIn } from './savings';
import { monthSummary } from './summary';
import { targetAt } from './target';

/**
 * Насколько близко к цели включается предупреждение: пока сверх цели
 * остаётся меньше 15%, шкала уже не зелёная.
 */
export const NEAR_TARGET_MARGIN = 0.15;

export type GaugeState =
  /** Осталось заметно больше цели */
  | 'SAFE'
  /** Осталось подошло к цели вплотную */
  | 'NEAR'
  /** Осталось меньше цели: в этом месяце цель не закрыть */
  | 'SHORT';

export interface BudgetGauge {
  /** Весь доход месяца по плану — подпись «Доход» */
  total: Money;
  /** Свободно к началу месяца: стартовая сумма и остатки прошлых месяцев без копилок */
  carried: Money;
  /** Пришло в этом месяце по сегодня */
  received: Money;
  /** Ушло в этом месяце по сегодня — окно «Потрачено» */
  spent: Money;
  /** Ещё придёт в этом месяце */
  pending: Money;
  /** Ближайший приход, если что-то ещё впереди */
  nextIncomeDate: DateStr | null;
  /** Отложено в активные копилки в этом месяце */
  earmarked: Money;
  /** Свободно сейчас: carried + received − spent − earmarked. Это «Осталось» */
  left: Money;
  /** План месяца: доход минус стоимость месяца. От него считается цвет */
  net: Money;
  target: Money | null;
  /** Свободно сейчас, доля шкалы 0..1 */
  fill: number;
  /** Ещё придёт, доля шкалы 0..1. Рисуется сразу за заливкой */
  pendingFill: number;
  /**
   * Где должна остаться заливка к концу месяца, чтобы цель выполнилась, 0..1.
   * null — цели нет, она нулевая или закрыта копилками целиком.
   */
  targetMark: number | null;
  state: GaugeState;
}

export function budgetGauge(doc: BudgetDocument, month: MonthKey, today: DateStr): BudgetGauge {
  const summary = monthSummary(doc, month, today);
  const cash = monthCash(doc, month, today);
  const target = targetAt(doc, month);

  const total = summary.totalIncome;
  const carried = carriedInto(doc, month, today);
  const earmarked = earmarkedIn(doc, month);
  const left = carried + cash.received - cash.paid - earmarked;

  // Долг прошлых месяцев шкалу не растягивает: она про деньги, которые есть
  const scale = Math.max(0, carried) + total;
  const share = (value: number): number => (scale > 0 ? Math.min(1, Math.max(0, value / scale)) : 0);

  // К концу месяца заливка придёт к carried + net − earmarked. Цель выполнена,
  // когда net >= target, то есть заливка не левее carried + target − earmarked.
  // Отложенное в копилки засчитывается в цель: риска сдвигается вместе с ним
  const goalLine = target !== null && target > 0 ? carried + target - earmarked : null;

  return {
    total,
    carried,
    received: cash.received,
    spent: cash.paid,
    pending: cash.pendingIncome,
    nextIncomeDate: cash.nextIncomeDate,
    earmarked,
    left,
    net: summary.net,
    target,
    fill: share(left),
    pendingFill: Math.min(share(cash.pendingIncome), 1 - share(left)),
    targetMark: goalLine !== null && goalLine > 0 && scale > 0 ? share(goalLine) : null,
    state: resolveState(summary.net, target),
  };
}

function resolveState(net: Money, target: Money | null): GaugeState {
  // Без цели сравнивать не с чем: красным отмечается только перерасход.
  // Нулевая цель — то же самое, сказанное вслух: откладывать не собираюсь
  if (target === null || target === 0) return net < 0 ? 'SHORT' : 'SAFE';
  if (net < target) return 'SHORT';
  if (net < target * (1 + NEAR_TARGET_MARGIN)) return 'NEAR';
  return 'SAFE';
}
