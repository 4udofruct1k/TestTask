/**
 * Сегодняшняя дата. Единственное место в приложении, которое смотрит на часы.
 *
 * Берётся один раз на монтирование и передаётся в расчёты явным параметром (1.1).
 * Локальное время, а не UTC: «сегодня» у пользователя на телефоне.
 */

import type { DateStr } from '../domain/types';

export function todayString(at: Date = new Date()): DateStr {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function nowIso(at: Date = new Date()): string {
  return at.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Сдвиг даты на дни. Считается через UTC, чтобы не поймать сдвиг на сутки
 * при переходе на летнее время — в домене такой функции нет намеренно:
 * там единица учёта месяц.
 */
export function shiftDays(date: DateStr, delta: number): DateStr {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return shifted.toISOString().slice(0, 10);
}
