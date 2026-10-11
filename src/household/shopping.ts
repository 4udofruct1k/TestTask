/**
 * Что купить сегодня. HOUSEHOLD_SPEC, раздел 4.
 *
 * Купить сегодня = нехватка на сегодняшнюю готовку плюс мясо и рыба на
 * завтрашнюю (их берут накануне). Нехватка запасов — масла, муки, соуса —
 * идёт отдельным списком «Проверьте запасы»: их покупают не каждый раз.
 *
 * Купленное хранится по людям: каждый правит только свои покупки, а строка
 * показывает общий итог.
 *
 * Список можно открыть на любой из ближайших дней. Для будущего дня «дома»
 * — это прогноз: нынешний остаток минус то, что до этого дня уйдёт
 * в готовку по плану и ещё не записано. Курица, купленная сегодня, сначала
 * покрывает сегодняшнее блюдо и только остатком — четверговое.
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

/** Сколько продукта ещё уйдёт в готовку в этот день: план минус записанное. */
function pendingUse(plan: Plan, state: HouseholdState, date: DateStr): Record<string, number> {
  const planned = needsOf(plan, weekKeyOf(date));
  const cooked = state.cooking[date] ?? {};
  const out: Record<string, number> = {};
  for (const [id, qty] of Object.entries(planned)) out[id] = Math.max(0, qty - (cooked[id] ?? 0));
  return out;
}

/**
 * Что будет дома к началу дня date: нынешний остаток, из которого по очереди
 * вычитается расход дней с today по вчерашний для date. Для сегодня — остаток как есть.
 */
export function stockOn(plan: Plan, state: HouseholdState, date: DateStr, today: DateStr): Record<string, number> {
  const stock: Record<string, number> = { ...state.stock };
  for (let d = today; d < date; d = addDays(d, 1)) {
    for (const [id, qty] of Object.entries(pendingUse(plan, state, d))) {
      stock[id] = Math.max(0, (stock[id] ?? 0) - qty);
    }
  }
  return stock;
}

export function shoppingFor(
  plan: Plan,
  state: HouseholdState,
  date: DateStr,
  me: Person,
  today: DateStr = date,
): Shopping {
  const dayNeeds = needsOf(plan, weekKeyOf(date));
  const tomorrow = needsOf(plan, weekKeyOf(addDays(date, 1)));
  const have = stockOn(plan, state, date, today);
  const want = new Map<string, { qty: number; forTomorrow: boolean }>();
  for (const [id, qty] of Object.entries(dayNeeds)) want.set(id, { qty, forTomorrow: false });
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
    const stock = have[product] ?? 0;
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
