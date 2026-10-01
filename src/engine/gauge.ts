/**
 * Шкала месяца для блока бюджета на главной (3.2).
 *
 * Полная шкала — весь доход месяца, заполнение — то, что из него ещё
 * свободно: не потрачено и не отложено в копилки. `весь доход − потрачено`
 * это `net`, накопление месяца; из него вычитается отложенное в копилки
 * в этом месяце — оно не потрачено, но уже и не свободно.
 *
 * Цвет шкалы по-прежнему считается от `net`: взнос в копилку — это и есть
 * накопление, и красить блок за то, что деньги отложили, было бы абсурдом.
 */

import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
import { contributionsOfMonth } from './goals';
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
  /** Весь доход месяца, он же полная шкала */
  total: Money;
  /** Потрачено всего, с постоянными */
  spent: Money;
  /** total − spent: накопление месяца, вместе с отложенным в копилки */
  net: Money;
  /** Взносы в копилки за месяц, все целиком */
  earmarked: Money;
  /**
   * Часть взносов, покрытая остатком этого месяца. Остальное пришло
   * из накоплений прошлых месяцев (1.7) и свободные деньги месяца не трогает
   */
  earmarkedFromMonth: Money;
  /** net − earmarkedFromMonth: свободно, не потрачено и никуда не отложено. Это «Осталось» */
  left: Money;
  target: Money | null;
  /** Доля заполнения, 0..1 */
  fill: number;
  /**
   * Где на шкале стоит цель, 0..1. Заполнение выше риски — цель ещё
   * закрывается, ниже — уже нет. null, если цель не задана.
   */
  targetMark: number | null;
  state: GaugeState;
}

export function budgetGauge(doc: BudgetDocument, month: MonthKey, today: DateStr): BudgetGauge {
  const summary = monthSummary(doc, month, today);
  const target = targetAt(doc, month);

  const total = summary.totalIncome;
  const spent = summary.monthCost;
  const net = summary.net;
  const earmarked = contributionsOfMonth(doc.goals, month);
  // Взнос сначала берётся из остатка месяца. Если отложили больше, чем
  // осталось, излишек пришёл из прошлых накоплений и в минус месяц не уводит
  const earmarkedFromMonth = Math.min(earmarked, Math.max(0, net));
  const left = net - earmarkedFromMonth;

  // Отложенное в копилки уже засчитано в цель: риска сдвигается на него.
  // Так «заливка выше риски» по-прежнему означает ровно «net >= цели»
  const uncovered = target === null ? null : target - earmarkedFromMonth;

  return {
    total,
    spent,
    net,
    earmarked,
    earmarkedFromMonth,
    left,
    target,
    // Потратить больше дохода можно, но шкала ниже нуля не опускается
    fill: total > 0 ? Math.min(1, Math.max(0, left / total)) : 0,
    // Цель больше всего дохода недостижима — риска упирается в край.
    // Нулевая цель риски не рисует: линия у пустого края ничего не значит.
    // Цель, целиком закрытая копилками, — тоже
    targetMark:
      target !== null && target > 0 && uncovered !== null && uncovered > 0 && total > 0
        ? Math.min(1, uncovered / total)
        : null,
    state: resolveState(net, target),
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
