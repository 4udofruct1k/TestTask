/**
 * Применение событий к общему состоянию. HOUSEHOLD_SPEC, раздел 3.
 *
 * Одна и та же функция работает в телефоне (показать своё, ещё не
 * отправленное, поверх последнего ответа сервера) и в облаке (принять
 * очередь). Поэтому здесь нет ни хранилища, ни часов, ни сети.
 *
 * События применяются строго по одному, в порядке прихода. Одновременные
 * правки двух телефонов не перезаписывают друг друга, а складываются:
 * событие — это «купил ещё 800 г», а не «теперь дома 800 г».
 */

import { addDays, type DateStr } from './days';
import type { HouseholdEvent, HouseholdState, Person } from './types';

/**
 * Сколько последних идентификаторов помнить для защиты от повтора.
 * Телефон шлёт очередь пачками по SYNC_BATCH, так что повтор потерянной
 * пачки всегда попадает в эту память, даже если между попытками
 * успел свестись второй телефон.
 */
export const APPLIED_KEEP = 500;
/**
 * Сколько дней истории покупок и готовки хранить. Экранам нужна только
 * текущая неделя; три — с запасом. Остатки не стареют. Короткая история
 * держит запись в базе маленькой: всё состояние — одна запись.
 */
export const HISTORY_DAYS = 21;
/** Самое большое разумное количество одного продукта: 100 кг или 100 000 штук. */
const MAX_AMOUNT = 100_000;

export function emptyState(): HouseholdState {
  return { rev: 0, stock: {}, purchases: {}, cooking: {}, applied: [] };
}

const PEOPLE: Person[] = ['max', 'ilvina'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRODUCT_RE = /^[a-z][a-z0-9_-]{0,31}$/;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Проверка пришедшего снаружи: в облако может прилететь что угодно. */
export function isEvent(raw: unknown): raw is HouseholdEvent {
  if (typeof raw !== 'object' || raw === null) return false;
  const e = raw as Record<string, unknown>;
  if (typeof e['id'] !== 'string' || e['id'].length < 8 || e['id'].length > 64) return false;
  if (typeof e['at'] !== 'string' || e['at'].length > 40) return false;
  if (!PEOPLE.includes(e['who'] as Person)) return false;
  if (typeof e['product'] !== 'string' || !PRODUCT_RE.test(e['product'])) return false;
  if (e['type'] === 'purchase' || e['type'] === 'cook') {
    return typeof e['date'] === 'string' && DATE_RE.test(e['date']) && finite(e['delta']) && Math.abs(e['delta']) <= MAX_AMOUNT;
  }
  if (e['type'] === 'stock') return finite(e['value']) && e['value'] >= 0 && e['value'] <= MAX_AMOUNT;
  return false;
}

const round = (v: number): number => Math.round(v * 100) / 100;

function setOrDelete<T extends Record<string, unknown>>(obj: T, key: string, value: number): void {
  if (value > 0) (obj as Record<string, unknown>)[key] = value;
  else delete (obj as Record<string, unknown>)[key];
}

/**
 * Одно событие. Возвращает новое состояние; исходное не меняется.
 * Остаток не уходит в минус: съели больше, чем числилось дома, — значит,
 * дома было больше, чем отмечено, а не «минус килограмм картошки».
 */
export function applyEvent(state: HouseholdState, event: HouseholdEvent): HouseholdState {
  if (state.applied.includes(event.id)) return state;

  const stock = { ...state.stock };
  const purchases = { ...state.purchases };
  const cooking = { ...state.cooking };
  const have = stock[event.product] ?? 0;

  if (event.type === 'purchase') {
    const day = { ...(purchases[event.date] ?? {}) };
    const mine = { ...(day[event.product] ?? {}) };
    const before = mine[event.who] ?? 0;
    // Убрать можно только своё купленное: чужую покупку правит её хозяин
    const after = Math.max(0, round(before + event.delta));
    const change = after - before;
    if (after > 0) mine[event.who] = after;
    else delete mine[event.who];
    if (Object.keys(mine).length > 0) day[event.product] = mine;
    else delete day[event.product];
    if (Object.keys(day).length > 0) purchases[event.date] = day;
    else delete purchases[event.date];
    setOrDelete(stock, event.product, round(Math.max(0, have + change)));
  } else if (event.type === 'cook') {
    const day = { ...(cooking[event.date] ?? {}) };
    const before = day[event.product] ?? 0;
    const after = Math.max(0, round(before + event.delta));
    const change = after - before;
    setOrDelete(day, event.product, after);
    if (Object.keys(day).length > 0) cooking[event.date] = day;
    else delete cooking[event.date];
    // Использовали — из остатков ушло; вернули запись — вернулось
    setOrDelete(stock, event.product, round(Math.max(0, have - change)));
  } else {
    setOrDelete(stock, event.product, round(event.value));
  }

  const applied = [...state.applied, event.id];
  return {
    rev: state.rev + 1,
    stock,
    purchases,
    cooking,
    applied: applied.length > APPLIED_KEEP ? applied.slice(applied.length - APPLIED_KEEP) : applied,
  };
}

/** Очередь целиком. acked — все события, которые больше не нужно присылать. */
export function applyEvents(
  state: HouseholdState,
  events: HouseholdEvent[],
): { state: HouseholdState; acked: string[] } {
  let next = state;
  for (const event of events) next = applyEvent(next, event);
  return { state: next, acked: events.map((e) => e.id) };
}

/** История старше HISTORY_DAYS уходит: для «сегодня» и «завтра» она не нужна. */
export function prune(state: HouseholdState, today: DateStr): HouseholdState {
  const cutoff = addDays(today, -HISTORY_DAYS);
  const keep = <T>(rec: Record<DateStr, T>): Record<DateStr, T> =>
    Object.fromEntries(Object.entries(rec).filter(([date]) => date >= cutoff));
  return { ...state, purchases: keep(state.purchases), cooking: keep(state.cooking) };
}

/** Состояние, пришедшее из сети или из файла, — проверка формы. */
export function isState(raw: unknown): raw is HouseholdState {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  const isRec = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v);
  return finite(s['rev']) && isRec(s['stock']) && isRec(s['purchases']) && isRec(s['cooking']) && Array.isArray(s['applied']);
}
