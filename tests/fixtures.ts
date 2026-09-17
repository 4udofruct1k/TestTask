/** Заготовки документов для тестов. Чисел спецификации здесь нет — только структура. */

import { CURRENT_SCHEMA_VERSION, type BudgetDocument } from '../src/domain/types';
import type { Expense, FixedItem, Flow, Kind, MonthKey, SavingsGoal } from '../src/domain/types';

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

// --------------------------------------------------- строители для кейсов 2.14


let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${++seq}`;

export function monthly(
  title: string,
  kind: Kind,
  categoryId: string,
  amounts: { fromMonth: MonthKey; amount: number }[],
  endMonth?: MonthKey,
): FixedItem {
  const item: FixedItem = { id: nextId('f'), title, kind, categoryId, mode: 'MONTHLY', amounts };
  if (endMonth) item.endMonth = endMonth;
  return item;
}

export function spread(
  title: string,
  categoryId: string,
  spreads: { fromMonth: MonthKey; totalAmount: number; months: number; payMonth?: MonthKey; payDay?: number }[],
): FixedItem {
  return { id: nextId('f'), title, kind: 'EXPENSE', categoryId, mode: 'SPREAD', spreads };
}

export function expense(date: string, amount: number, categoryId: string, flow?: Flow): Expense {
  const e: Expense = { id: nextId('e'), date, amount, categoryId, createdAt: `${date}T10:00:00Z` };
  if (flow) e.flow = flow;
  return e;
}

/** n одинаковых трат по дням 1..n — ровная рутина без остатка от деления. */
export function dailyRoutineExpenses(month: MonthKey, days: number, perDay: number, categoryId: string): Expense[] {
  return Array.from({ length: days }, (_, i) =>
    expense(`${month}-${String(i + 1).padStart(2, '0')}`, perDay, categoryId),
  );
}

export function goal(title: string, targetAmount: number, contributions: { month: MonthKey; amount: number }[], deadline?: MonthKey): SavingsGoal {
  const g: SavingsGoal = {
    id: nextId('g'),
    title,
    targetAmount,
    contributions: contributions.map((c) => ({ id: nextId('c'), month: c.month, amount: c.amount })),
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
  };
  if (deadline) g.deadline = deadline;
  return g;
}
