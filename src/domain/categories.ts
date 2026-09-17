/**
 * Правила категорий. Раздел 1.2.
 *
 * Здесь то, что нужно и валидатору при загрузке, и экрану при создании:
 * инварианты должны совпадать, иначе приложение даст завести то, что потом
 * само же и починит.
 */

import type { Category, Kind } from './types';

export const MAX_CATEGORY_NAME = 40;

/** Имя после trim и обрезки по длине — ровно то, что сохранится. */
export function normalizeCategoryName(name: string): string {
  return name.trim().slice(0, MAX_CATEGORY_NAME);
}

/**
 * Имя занято в пределах направления, сравнение регистронезависимое
 * (1.2, инвариант 2). exceptId — сама правящаяся категория.
 */
export function isCategoryNameTaken(
  categories: Category[],
  kind: Kind,
  name: string,
  exceptId?: string,
): boolean {
  const needle = normalizeCategoryName(name).toLocaleLowerCase('ru-RU');
  if (needle === '') return false;
  return categories.some(
    (category) =>
      category.id !== exceptId &&
      category.kind === kind &&
      category.name.toLocaleLowerCase('ru-RU') === needle,
  );
}

/** Можно ли сохранить категорию с таким именем. */
export function isCategoryNameValid(
  categories: Category[],
  kind: Kind,
  name: string,
  exceptId?: string,
): boolean {
  return normalizeCategoryName(name) !== '' && !isCategoryNameTaken(categories, kind, name, exceptId);
}
