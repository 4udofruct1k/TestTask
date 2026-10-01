/**
 * Готовка дня и сколько продуктов ушло. HOUSEHOLD_SPEC, раздел 5.
 *
 * По умолчанию предлагается количество из рецепта; записывается то,
 * что вписали. Записанное списывается с остатков — так покупки следующего
 * дня считаются от того, что на самом деле осталось.
 */

import { weekKeyOf, type DateStr } from './days';
import { needsOf, recipesOf, type Plan, type Product, type Recipe } from './plan';
import type { HouseholdState } from './types';

export interface UseRow {
  product: string;
  p: Product;
  /** По рецепту */
  planned: number;
  /** Записано как использованное; 0 — ещё не записано */
  used: number;
  /** Дома сейчас */
  stock: number;
}

export interface Cooking {
  recipes: Recipe[];
  rows: UseRow[];
  /** Готовку этого дня уже записали */
  recorded: boolean;
}

export function cookingFor(plan: Plan, state: HouseholdState, date: DateStr): Cooking {
  const key = weekKeyOf(date);
  const planned = needsOf(plan, key);
  const used = state.cooking[date] ?? {};
  const rows: UseRow[] = Object.entries(planned)
    .filter(([id]) => plan.catalog[id])
    .map(([product, qty]) => ({
      product,
      p: plan.catalog[product]!,
      planned: qty,
      used: used[product] ?? 0,
      stock: state.stock[product] ?? 0,
    }));
  return { recipes: recipesOf(plan, key), rows, recorded: Object.keys(used).length > 0 };
}
