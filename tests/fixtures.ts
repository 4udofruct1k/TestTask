/** Заготовки документов для тестов. Чисел спецификации здесь нет — только структура. */

import { CURRENT_SCHEMA_VERSION, type BudgetDocument } from '../src/domain/types';

export function emptyDoc(): BudgetDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    categories: [
      {
        id: 'c-salary',
        name: 'Зарплата',
        kind: 'INCOME',
        essential: false,
        defaultFlow: 'ROUTINE',
        icon: '💰',
        color: '#22C46E',
        archived: false,
        sortOrder: 0,
      },
      {
        id: 'c-food',
        name: 'Продукты',
        kind: 'EXPENSE',
        essential: true,
        defaultFlow: 'ROUTINE',
        icon: '🛒',
        color: '#1C6BFF',
        archived: false,
        sortOrder: 1,
      },
      {
        id: 'c-tech',
        name: 'Техника',
        kind: 'EXPENSE',
        essential: false,
        defaultFlow: 'ONE_OFF',
        icon: '🎧',
        color: '#D8453C',
        archived: false,
        sortOrder: 2,
      },
      {
        id: 'c-home',
        name: 'Жильё',
        kind: 'EXPENSE',
        essential: true,
        defaultFlow: 'ROUTINE',
        icon: '🏠',
        color: '#06834A',
        archived: false,
        sortOrder: 3,
      },
    ],
    expenses: [],
    fixedItems: [],
    overrides: [],
    goals: [],
    settings: {
      firstMonth: '2026-01',
      startingBalance: 0,
      targets: [],
      forecastMinDay: 5,
      oneOffWindow: 6,
      createdAt: '2026-01-01T00:00:00Z',
    },
  };
}

/** Рубли в копейки — для читаемости тестов, числа спецификации даны в рублях. */
export const R = (rubles: number): number => Math.round(rubles * 100);
