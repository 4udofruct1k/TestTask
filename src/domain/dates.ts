/**
 * Календарные примитивы. Раздел 2.2.
 *
 * Всё считается разбором строки. Конструктор Date в этом файле запрещён:
 * new Date("2026-03-16") парсится как UTC, new Date(2026, 2, 16) — как
 * локальное время, и смешение двух путей даёт сдвиг на сутки.
 */

import type { DateStr, MonthKey } from './types';

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Длины месяцев невисокосного года. */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function yearOf(month: MonthKey): number {
  return Number(month.slice(0, 4));
}

/** Номер месяца 1..12. */
export function monthOf(month: MonthKey): number {
  return Number(month.slice(5, 7));
}

export function isMonthKey(value: unknown): value is MonthKey {
  if (typeof value !== 'string' || !MONTH_KEY_RE.test(value)) return false;
  const m = Number(value.slice(5, 7));
  return m >= 1 && m <= 12;
}

export function isDateStr(value: unknown): value is DateStr {
  if (typeof value !== 'string' || !DATE_STR_RE.test(value)) return false;
  const month = value.slice(0, 7);
  if (!isMonthKey(month)) return false;
  const day = Number(value.slice(8, 10));
  return day >= 1 && day <= daysInMonth(month);
}

/** "2026-03-16" → "2026-03" */
export function monthKeyOf(date: DateStr): MonthKey {
  return date.slice(0, 7);
}

/** "2026-03-16" → 16 */
export function dayOfMonth(date: DateStr): number {
  return Number(date.slice(8, 10));
}

export function daysInMonth(month: MonthKey): number {
  const m = monthOf(month);
  const base = MONTH_LENGTHS[m - 1];
  if (base === undefined) throw new Error(`Некорректный месяц: ${month}`);
  if (m === 2 && isLeapYear(yearOf(month))) return 29;
  return base;
}

/** Сдвиг месяца на n, n может быть отрицательным. */
export function addMonths(month: MonthKey, n: number): MonthKey {
  const index = yearOf(month) * 12 + (monthOf(month) - 1) + n;
  const year = Math.floor(index / 12);
  const m = index - year * 12 + 1;
  return `${pad(year, 4)}-${pad(m, 2)}`;
}

/** Сколько месяцев от from до to. Отрицательное, если to раньше from. */
export function monthsBetween(from: MonthKey, to: MonthKey): number {
  return yearOf(to) * 12 + monthOf(to) - (yearOf(from) * 12 + monthOf(from));
}

/** -1 | 0 | 1. Для "YYYY-MM" лексикографический порядок совпадает с хронологическим. */
export function compareMonth(a: MonthKey, b: MonthKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** То же для "YYYY-MM-DD". */
export function compareDate(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Список месяцев включительно. Пустой, если from позже to. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const count = monthsBetween(from, to);
  if (count < 0) return [];
  const out: MonthKey[] = [];
  for (let i = 0; i <= count; i++) out.push(addMonths(from, i));
  return out;
}

/** Месяц из ISO-метки "2026-03-16T18:42:11Z" → "2026-03". Тоже разбором строки. */
export function monthKeyOfIso(iso: string): MonthKey | null {
  const head = iso.slice(0, 7);
  return isMonthKey(head) ? head : null;
}

function pad(value: number, width: number): string {
  const negative = value < 0;
  const digits = String(Math.abs(value)).padStart(width, '0');
  return negative ? `-${digits}` : digits;
}
