/**
 * Календарь годовых платежей. Раздел 2.11.
 *
 * Календарь ничего не добавляет к суммам месяца и ни на что не влияет.
 * Он отвечает на единственный вопрос: в каком месяце и сколько уйдёт
 * одним куском. Без него размазывание превращается в ловушку.
 */

import { addMonths, compareMonth, monthsBetween } from '../domain/dates';
import type { BudgetDocument, Money, MonthKey } from '../domain/types';
import { amountAt, activeSpreadPeriod } from './fixed';

export interface CalendarPayment {
  itemId: string;
  title: string;
  /** Полная сумма платежа, а не доля месяца */
  amount: Money;
  day?: number;
}

export interface CalendarMonth {
  month: MonthKey;
  payments: CalendarPayment[];
  total: Money;
}

export function annualCalendar(doc: BudgetDocument, fromMonth: MonthKey, horizon = 12): CalendarMonth[] {
  const out: CalendarMonth[] = [];

  for (let i = 0; i < horizon; i++) {
    const month = addMonths(fromMonth, i);
    const payments: CalendarPayment[] = [];

    for (const item of doc.fixedItems) {
      if (item.mode !== 'SPREAD') continue;
      // Позиция должна действовать в этом месяце: закрытая по endMonth больше не платится
      if (amountAt(item, month) === null) continue;

      const period = activeSpreadPeriod(item, month);
      if (!period) continue;

      // Месяц списания: payMonth активного периода, либо fromMonth. Дальше шагом months
      const firstPay = period.payMonth ?? period.fromMonth;
      const offset = monthsBetween(firstPay, month);
      if (offset < 0 || offset % period.months !== 0) continue;

      const payment: CalendarPayment = { itemId: item.id, title: item.title, amount: period.totalAmount };
      if (period.payDay !== undefined) payment.day = period.payDay;
      payments.push(payment);
    }

    out.push({ month, payments, total: payments.reduce((sum, p) => sum + p.amount, 0) });
  }

  return out;
}

/** Есть ли вообще размазанные платежи — показывать ли ссылку на календарь (3.3). */
export function hasSpreadItems(doc: BudgetDocument, month: MonthKey): boolean {
  return doc.fixedItems.some((item) => item.mode === 'SPREAD' && amountAt(item, month) !== null);
}

/** Годовая стоимость размазанных платежей, действующих в месяце. */
export function spreadYearTotal(doc: BudgetDocument, month: MonthKey): Money {
  let sum = 0;
  for (const item of doc.fixedItems) {
    if (item.mode !== 'SPREAD' || amountAt(item, month) === null) continue;
    const period = activeSpreadPeriod(item, month);
    if (period && compareMonth(period.fromMonth, month) <= 0) sum += period.totalAmount;
  }
  return sum;
}
