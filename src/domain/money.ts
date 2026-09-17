/**
 * Деньги. Раздел 1.1 и правила отображения 3.10.
 *
 * В домене и хранилище — только целые копейки. Округление живёт здесь
 * и больше нигде: расчёты возвращают целое, слой отображения режет до рублей.
 */

import type { Money } from './types';

export const KOPECKS_IN_RUBLE = 100;

/** Пробел-разделитель разрядов. Неразрывный, чтобы сумма не переносилась. */
const GROUP_SEPARATOR = ' ';

export function isMoney(value: unknown): value is Money {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Целое и строго положительное — требование почти всех инвариантов Части 1. */
export function isPositiveMoney(value: unknown): value is Money {
  return isMoney(value) && value > 0;
}

/**
 * Перевод результата деления обратно в деньги (2.1).
 * Копейка вверх или вниз роли не играет, но результат обязан остаться целым.
 */
export function toMoney(value: number): Money {
  if (!Number.isFinite(value)) throw new Error('Нечисловой результат расчёта');
  return Math.round(value);
}

export function rublesToMoney(rubles: number): Money {
  return toMoney(rubles * KOPECKS_IN_RUBLE);
}

/**
 * Разбор пользовательского ввода в копейки.
 * Принимает "1500", "1 500,50", "1500.5". Возвращает null на мусоре,
 * на пустой строке и на вводе с более чем двумя знаками после запятой:
 * "10,555" — это опечатка, а не сумма.
 */
export function parseAmount(raw: string): Money | null {
  const cleaned = raw.replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith('-');
  const body = negative ? cleaned.slice(1) : cleaned;
  const [whole = '', fraction = ''] = body.split('.');
  if (whole === '' && fraction === '') return null;
  if (fraction.length > 2) return null;

  const kopecks = Number(whole || '0') * KOPECKS_IN_RUBLE + Number(fraction.padEnd(2, '0') || '0');
  if (!Number.isFinite(kopecks)) return null;
  return negative ? -kopecks : kopecks;
}

/** Целые рубли: списки, графики, итоги. "1 500" */
export function formatAmount(amount: Money): string {
  const rubles = Math.round(amount / KOPECKS_IN_RUBLE);
  return formatInteger(rubles);
}

/** С копейками: ввод и правка. "1 500,50" */
export function formatAmountExact(amount: Money): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const rubles = Math.trunc(abs / KOPECKS_IN_RUBLE);
  const kopecks = abs - rubles * KOPECKS_IN_RUBLE;
  const sign = negative ? '-' : '';
  return `${sign}${formatInteger(rubles)},${String(kopecks).padStart(2, '0')}`;
}

/** То же с рублём. Крупные суммы не сокращаются до «83k» (3.10). */
export function formatRub(amount: Money): string {
  return `${formatAmount(amount)} ₽`;
}

export function formatRubExact(amount: Money): string {
  return `${formatAmountExact(amount)} ₽`;
}

/** Со знаком плюс для положительных — там, где важно направление. */
export function formatSignedRub(amount: Money): string {
  return amount > 0 ? `+${formatRub(amount)}` : formatRub(amount);
}

/** Разряды по три, знак минус впереди. Своя реализация вместо Intl: детерминизм. */
function formatInteger(value: number): string {
  const negative = value < 0;
  const digits = String(Math.abs(value));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += GROUP_SEPARATOR;
    out += digits[i];
  }
  return negative ? `-${out}` : out;
}
