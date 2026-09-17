/**
 * Шкала месяца для блока бюджета на главной (3.2).
 *
 * Полная шкала — весь доход месяца, заполнение — то, что из него ещё
 * не потрачено. Величины не выдуманные: `весь доход − потрачено всего`
 * это в точности `net`, накопление месяца, а доля заполнения —
 * в точности ставка накопления из 2.5.
 */

import type { BudgetDocument, DateStr, Money, MonthKey } from '../domain/types';
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
  /** total − spent. Совпадает с net месяца */
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
  const left = summary.net;

  return {
    total,
    spent,
    left,
    target,
    // Потратить больше дохода можно, но шкала ниже нуля не опускается
    fill: total > 0 ? Math.min(1, Math.max(0, left / total)) : 0,
    // Цель больше всего дохода недостижима — риска упирается в край
    targetMark: target !== null && total > 0 ? Math.min(1, target / total) : null,
    state: resolveState(left, target),
  };
}

function resolveState(left: Money, target: Money | null): GaugeState {
  // Без цели сравнивать не с чем: красным отмечается только перерасход
  if (target === null) return left < 0 ? 'SHORT' : 'SAFE';
  if (left < target) return 'SHORT';
  if (left < target * (1 + NEAR_TARGET_MARGIN)) return 'NEAR';
  return 'SAFE';
}
