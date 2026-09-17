/**
 * Что писать в поле flow операции. Раздел 1.3, инвариант 5.
 *
 * Поле хранится, только когда оно переопределяет подсказку категории:
 * в подавляющем большинстве операций его нет, и вид потока берётся
 * из defaultFlow. Два источника одного значения разъехались бы при
 * первой же правке категории.
 */

import type { Category, Flow } from './types';

export function flowToStore(chosen: Flow, category: Category | undefined): Flow | undefined {
  // У доходов поток не определён и в расчётах не используется
  if (category?.kind === 'INCOME') return undefined;
  // Категория неизвестна — сохраняем выбор, он единственное, что есть
  if (!category) return chosen;
  return chosen === category.defaultFlow ? undefined : chosen;
}
