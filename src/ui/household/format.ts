/**
 * Подписи для общих разделов: граммы и килограммы, пачки, дни недели.
 */

import { addDays, weekdayOf, type DateStr } from '../../household/days';
import type { Product } from '../../household/plan';
import { pluralForm } from '../format';

/** Узкий неразрывный пробел между разрядами: «1 600», и число не рвётся. */
const GROUP = ' ';

export function num(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '−' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

export const rub = (n: number): string => `${num(n)} ₽`;

/** Дробь с запятой и без лишних нулей: 1,6 — а не 1.60. */
const decimal = (v: number): string => String(Math.round(v * 100) / 100).replace('.', ',');

export function amount(value: number, unit: Product['unit']): string {
  if (unit === 'г' && value >= 1000) return `${decimal(value / 1000)} кг`;
  if (unit === 'мл' && value >= 1000) return `${decimal(value / 1000)} л`;
  return `${Number.isInteger(value) ? num(value) : decimal(value)} ${unit}`;
}

/** «2 × 900 г», если берут пачками; иначе просто количество. */
export function packLabel(value: number, p: Product): string {
  if (!p.pack || value % p.pack !== 0 || value === 0) return amount(value, p.unit);
  const packs = value / p.pack;
  return packs === 1 ? amount(p.pack, p.unit) : `${packs} × ${amount(p.pack, p.unit)}`;
}

/** Шаг кнопок «−» и «+»: пачка или разумная порция. */
export function stepOf(p: Product): number {
  if (p.pack) return p.pack;
  return p.unit === 'шт' || p.unit === 'зуб.' ? 1 : 100;
}

export function parseQty(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '') return 0;
  if (!/^\d*(\.\d*)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export const DAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const DAY_ACC = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «Четверг, 1 октября» */
export function longDate(date: DateStr): string {
  const name = DAY_NAMES[weekdayOf(date)]!;
  return `${name[0]!.toUpperCase()}${name.slice(1)}, ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** «сегодня», «завтра», «вчера» или «в среду» — для подписей. */
export function relativeDay(date: DateStr, today: DateStr): string {
  if (date === today) return 'сегодня';
  if (date === addDays(today, 1)) return 'завтра';
  if (date === addDays(today, -1)) return 'вчера';
  const i = weekdayOf(date);
  return `${i === 1 ? 'во' : 'в'} ${DAY_ACC[i]}`;
}

export const positionsWord = (n: number): string => pluralForm(n, 'позиция', 'позиции', 'позиций');
export const changesWord = (n: number): string => pluralForm(n, 'изменение', 'изменения', 'изменений');

/** «в 03:12» или «1 окт в 03:12» — когда сводились. */
export function syncedAt(iso: string, now: Date): string {
  const t = new Date(iso);
  const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const sameDay = t.toDateString() === now.toDateString();
  return sameDay ? `сегодня в ${hm}` : `${t.getDate()} ${MONTHS[t.getMonth()]} в ${hm}`;
}
