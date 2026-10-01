/**
 * План питания на неделю, зашитый в приложение. HOUSEHOLD_SPEC, раздел 1.
 *
 * Источник — рацион «Неделя на двоих»: приёмы пищи по дням для каждого,
 * готовка с граммовками, список покупок. Новый рацион — новая версия
 * приложения: план не редактируется на телефоне и не синхронизируется.
 */

import raw from './plan.json';
import type { WeekKey } from './days';
import type { Person } from './types';

export interface Product {
  name: string;
  /** Короткое имя для плиток и фишек: «Курица», а не «Куриное филе» */
  short: string;
  e: string;
  unit: 'г' | 'мл' | 'шт' | 'зуб.';
  /** Размер пачки в единицах продукта; null — продаётся на вес */
  pack: number | null;
  /** ₽ за единицу: оценка из списка покупок рациона */
  price: number;
  /** fresh — покупается под готовку; pantry — запас, проверяется, а не покупается каждый раз */
  kind: 'fresh' | 'pantry';
  /** eve — брать накануне: мясо и охлаждённая рыба долго не лежат */
  lead: 'eve' | null;
}

export interface Chip {
  e: string;
  name: string;
  amt: string | null;
  sub?: string | null;
  muted?: boolean;
}

export interface Kbju {
  kcal: number;
  p: number;
  f: number;
  c: number;
}

export interface Portion {
  groups: { label: string | null; chips: Chip[] }[];
  kbju: Kbju | null;
}

export interface Meal {
  name: string;
  dish: string | null;
  /** Блюдо готовится в этот же день */
  fresh: boolean;
  rub: string | null;
  who: Record<Person, Portion>;
}

export type Dish = 'curry' | 'shrimp' | 'trout' | 'ragu' | 'beef';

export interface PlanDay {
  key: WeekKey;
  title: string;
  dish: Dish;
  cook: string;
  cost: number | null;
  meals: Meal[];
}

export interface Recipe {
  day: WeekKey;
  dish: Dish;
  title: string;
  when: string;
  ingredients: Chip[];
  steps: string[];
  split: string | null;
  notes: string[];
  /** Сколько продуктов уходит: из этого считаются покупки и списание */
  uses: Record<string, number>;
}

export interface Goal {
  kcal: number;
  p: number;
  f: number;
  c: number;
  label: string;
}

export interface Plan {
  title: string;
  people: Record<Person, Goal>;
  days: PlanDay[];
  recipes: Recipe[];
  catalog: Record<string, Product>;
  weekly: { group: string; items: { name: string; qty: string; price: string }[] }[];
}

export const PLAN = raw as unknown as Plan;

export function dayOf(plan: Plan, key: WeekKey): PlanDay {
  return plan.days.find((d) => d.key === key) ?? plan.days[0]!;
}

export function recipesOf(plan: Plan, key: WeekKey): Recipe[] {
  return plan.recipes.filter((r) => r.day === key);
}

/** Сколько продуктов нужно на готовку дня: сумма по его рецептам. */
export function needsOf(plan: Plan, key: WeekKey): Record<string, number> {
  const out: Record<string, number> = {};
  for (const recipe of recipesOf(plan, key)) {
    for (const [id, qty] of Object.entries(recipe.uses)) out[id] = (out[id] ?? 0) + qty;
  }
  return out;
}
