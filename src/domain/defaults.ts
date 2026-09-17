/**
 * Стартовый набор категорий (1.2) и пустой документ первого запуска (1.8).
 */

import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_FORECAST_MIN_DAY,
  DEFAULT_ONE_OFF_WINDOW,
  type BudgetDocument,
  type Category,
  type Flow,
  type Kind,
  type MonthKey,
} from './types';

interface Seed {
  name: string;
  kind: Kind;
  essential: boolean;
  defaultFlow: Flow;
  icon: string;
  color: string;
}

/** Ровно тот набор, что перечислен в 1.2. */
const SEEDS: Seed[] = [
  // Расходы ROUTINE
  { name: 'Продукты', kind: 'EXPENSE', essential: true, defaultFlow: 'ROUTINE', icon: '🛒', color: '#22C46E' },
  { name: 'Кафе', kind: 'EXPENSE', essential: false, defaultFlow: 'ROUTINE', icon: '☕', color: '#D8453C' },
  { name: 'Транспорт', kind: 'EXPENSE', essential: true, defaultFlow: 'ROUTINE', icon: '🚌', color: '#1C6BFF' },
  { name: 'Связь', kind: 'EXPENSE', essential: true, defaultFlow: 'ROUTINE', icon: '📱', color: '#06834A' },
  { name: 'Здоровье', kind: 'EXPENSE', essential: true, defaultFlow: 'ROUTINE', icon: '💊', color: '#FF2D62' },
  // Расходы ONE_OFF
  { name: 'Одежда', kind: 'EXPENSE', essential: false, defaultFlow: 'ONE_OFF', icon: '👕', color: '#6B7A70' },
  { name: 'Техника', kind: 'EXPENSE', essential: false, defaultFlow: 'ONE_OFF', icon: '🎧', color: '#0E1511' },
  { name: 'Развлечения', kind: 'EXPENSE', essential: false, defaultFlow: 'ONE_OFF', icon: '🎬', color: '#00D26A' },
  { name: 'Подарки', kind: 'EXPENSE', essential: false, defaultFlow: 'ONE_OFF', icon: '🎁', color: '#D8453C' },
  { name: 'Прочее', kind: 'EXPENSE', essential: false, defaultFlow: 'ONE_OFF', icon: '💸', color: '#6B7A70' },
  // Категории под постоянные позиции
  { name: 'Жильё', kind: 'EXPENSE', essential: true, defaultFlow: 'ROUTINE', icon: '🏠', color: '#06834A' },
  { name: 'Подписки', kind: 'EXPENSE', essential: false, defaultFlow: 'ROUTINE', icon: '🔁', color: '#1C6BFF' },
  // Доходы
  { name: 'Зарплата', kind: 'INCOME', essential: false, defaultFlow: 'ROUTINE', icon: '💰', color: '#22C46E' },
  { name: 'Премия', kind: 'INCOME', essential: false, defaultFlow: 'ROUTINE', icon: '🏅', color: '#00D26A' },
  { name: 'Прочее', kind: 'INCOME', essential: false, defaultFlow: 'ROUTINE', icon: '💵', color: '#6B7A70' },
];

export function starterCategories(makeId: () => string): Category[] {
  return SEEDS.map((seed, i) => ({
    id: makeId(),
    name: seed.name,
    kind: seed.kind,
    essential: seed.essential,
    defaultFlow: seed.defaultFlow,
    icon: seed.icon,
    color: seed.color,
    archived: false,
    sortOrder: i,
  }));
}

/** Документ первого запуска. Пустой, но рабочий: онбординг всё пропускаемый (3.11). */
export function createInitialDocument(
  firstMonth: MonthKey,
  createdAt: string,
  makeId: () => string,
): BudgetDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    categories: starterCategories(makeId),
    expenses: [],
    fixedItems: [],
    overrides: [],
    goals: [],
    settings: {
      firstMonth,
      startingBalance: 0,
      targets: [],
      forecastMinDay: DEFAULT_FORECAST_MIN_DAY,
      oneOffWindow: DEFAULT_ONE_OFF_WINDOW,
      createdAt,
    },
  };
}
