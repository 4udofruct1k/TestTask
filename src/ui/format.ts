/**
 * Склонения и подписи. Числительные склоняются везде (3.10).
 */

import { dayOfMonth, monthKeyOf, monthOf, yearOf } from '../domain/dates';
import type { DateStr, MonthKey } from '../domain/types';

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Выбор формы: 1 трата, 2 траты, 5 трат. */
export function pluralForm(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const hundred = abs % 100;
  const ten = abs % 10;
  if (hundred >= 11 && hundred <= 14) return many;
  if (ten === 1) return one;
  if (ten >= 2 && ten <= 4) return few;
  return many;
}

export function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${pluralForm(n, one, few, many)}`;
}

export const days = (n: number): string => plural(n, 'день', 'дня', 'дней');
export const months = (n: number): string => plural(n, 'месяц', 'месяца', 'месяцев');
export const positions = (n: number): string => plural(n, 'позиция', 'позиции', 'позиций');
export const spendings = (n: number): string => plural(n, 'трата', 'траты', 'трат');
export const purchases = (n: number): string => plural(n, 'покупка', 'покупки', 'покупок');
export const goalsWord = (n: number): string => plural(n, 'цель', 'цели', 'целей');
export const categoriesWord = (n: number): string => plural(n, 'категория', 'категории', 'категорий');
export const activeCategories = (n: number): string =>
  plural(n, 'активная категория', 'активные категории', 'активных категорий');

/** "2026-03" → "Март 2026" */
export function monthTitle(month: MonthKey): string {
  return `${MONTHS_NOMINATIVE[monthOf(month) - 1]} ${yearOf(month)}`;
}

/** "2026-03" → "март 2026" — внутри фразы */
export function monthTitleLower(month: MonthKey): string {
  return monthTitle(month).toLocaleLowerCase('ru-RU');
}

/** "2026-03" → "мар" */
export function monthShort(month: MonthKey): string {
  return MONTHS_SHORT[monthOf(month) - 1] ?? '';
}

/** "2026-03-16" → "16 марта" */
export function dayTitle(date: DateStr): string {
  return `${dayOfMonth(date)} ${MONTHS_GENITIVE[monthOf(monthKeyOf(date)) - 1]}`;
}

/** "2026-03" → "марта 2026" — родительный падеж, для фраз «с ...» */
export function monthGenitive(month: MonthKey): string {
  return `${MONTHS_GENITIVE[monthOf(month) - 1]} ${yearOf(month)}`;
}

/** "2026-03" → "с апреля" — для диалога правки постоянной позиции (3.4) */
export function fromMonthPhrase(month: MonthKey): string {
  return `с ${MONTHS_GENITIVE[monthOf(month) - 1]}`;
}

/** Доля в проценты: 0.789 → "+78,9%". null → прочерк. */
export function formatPct(value: number | null, withSign = true): string {
  if (value === null) return '—';
  const percent = value * 100;
  const rounded = Math.round(percent * 10) / 10;
  const sign = withSign && rounded > 0 ? '+' : '';
  return `${sign}${String(rounded).replace('.', ',')}%`;
}

/** Месяцы с дробью: 4.2 → "4,2" */
export function formatMonthsCount(value: number): string {
  return (Math.round(value * 10) / 10).toString().replace('.', ',');
}
