/**
 * Что купить сегодня. HOUSEHOLD_SPEC, раздел 4.
 *
 * Купить сегодня = нехватка на сегодняшнюю готовку плюс мясо и рыба на
 * завтрашнюю (их берут накануне). Нехватка запасов — масла, муки, соуса —
 * идёт отдельным списком «Проверьте запасы»: их покупают не каждый раз.
 *
 * Купленное хранится по людям: каждый правит только свои покупки, а строка
 * показывает общий итог.
 */

import { addDays, weekKeyOf, type DateStr } from './days';
import { needsOf, type Plan, type Product } from './plan';
import type { HouseholdState, Person } from './types';

export type RowStatus = 'todo' | 'partial' | 'done';

export interface ShopRow {
  product: string;
  p: Product;
  /** Нужно на готовку */
  need: number;
  /** Было дома до сегодняшних покупок */
  haveBefore: number;
  /** Не хватало до покупок */
  shortBefore: number;
  /** Не хватает сейчас */
  short: number;
  /** Куплено сегодня обоими */
  got: number;
  /** Из них — мной */
  mine: number;
  /** Сколько брать, с округлением до пачек */
  suggest: number;
  status: RowStatus;
  /** Попало в список ради завтрашней готовки */
  forTomorrow: boolean;
  /** Оценка стоимости того, что ещё брать, ₽ */
  cost: number;
}

export interface Shopping {
  must: ShopRow[];
  pantry: ShopRow[];
  enough: ShopRow[];
  /** Сколько позиций в «купить сегодня» ещё не закрыто */
  open: number;
  /** Оценка того, что ещё купить, ₽ */
  cost: number;
}

/** Нехватка с округлением вверх до пачки. */
export function roundToPack(short: number, p: Product): number {
  if (short <= 0) return 0;
  return p.pack ? Math.ceil(short / p.pack) * p.pack : Math.ceil(short);
}

export function shoppingFor(plan: Plan, state: HouseholdState, date: DateStr, me: Person): Shopping {
  const today = needsOf(plan, weekKeyOf(date));
  const tomorrow = needsOf(plan, weekKeyOf(addDays(date, 1)));
  const want = new Map<string, { qty: number; forTomorrow: boolean }>();
  for (const [id, qty] of Object.entries(today)) want.set(id, { qty, forTomorrow: false });
  for (const [id, qty] of Object.entries(tomorrow)) {
    if (plan.catalog[id]?.lead !== 'eve') continue;
    const has = want.get(id);
    want.set(id, { qty: (has?.qty ?? 0) + qty, forTomorrow: !has });
  }

  const bought = state.purchases[date] ?? {};
  const rows: ShopRow[] = [];
  for (const [product, w] of want) {
    const p = plan.catalog[product];
    if (!p) continue;
    const byPerson = bought[product] ?? {};
    const got = Object.values(byPerson).reduce((s, v) => s + (v ?? 0), 0);
    const mine = byPerson[me] ?? 0;
    const stock = state.stock[product] ?? 0;
    const haveBefore = Math.max(0, stock - got);
    const shortBefore = Math.max(0, w.qty - haveBefore);
    const short = Math.max(0, w.qty - stock);
    const suggest = roundToPack(short, p);
    const status: RowStatus = got === 0 ? 'todo' : short > 0 ? 'partial' : 'done';
    rows.push({
      product, p, need: w.qty, haveBefore, shortBefore, short, got, mine, suggest, status,
      forTomorrow: w.forTomorrow, cost: Math.round(suggest * p.price),
    });
  }

  const listed = (r: ShopRow): boolean => r.shortBefore > 0 || r.got > 0;
  const must = rows.filter((r) => listed(r) && r.p.kind === 'fresh');
  const pantry = rows.filter((r) => listed(r) && r.p.kind === 'pantry');
  const enough = rows.filter((r) => !listed(r));
  const open = must.filter((r) => r.status !== 'done');
  return { must, pantry, enough, open: open.length, cost: open.reduce((s, r) => s + r.cost, 0) };
}
