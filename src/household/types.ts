/**
 * Общие данные двоих: остатки дома, покупки, готовка. HOUSEHOLD_SPEC, раздел 2.
 *
 * Бюджет сюда не входит и никуда не уходит: у каждого свой, в телефоне.
 * Общее — только то, что про один холодильник.
 */

import type { DateStr } from './days';

export type Person = 'max' | 'ilvina';

export const PEOPLE: { id: Person; name: string }[] = [
  { id: 'max', name: 'Макс' },
  { id: 'ilvina', name: 'Ильвина' },
];

export const personName = (id: Person): string => PEOPLE.find((p) => p.id === id)?.name ?? id;

/**
 * Состояние, которое хранит облако. Количества — в единицах продукта
 * из каталога плана: граммы, миллилитры или штуки.
 */
export interface HouseholdState {
  /** Номер правки на сервере. Растёт на каждое принятое событие */
  rev: number;
  /** Что есть дома сейчас */
  stock: Record<string, number>;
  /** Куплено: дата → продукт → кто → сколько. Каждый правит только свои покупки */
  purchases: Record<DateStr, Record<string, Partial<Record<Person, number>>>>;
  /** Использовано в готовке: дата → продукт → сколько */
  cooking: Record<DateStr, Record<string, number>>;
  /** Последние принятые события — повторная отправка той же очереди ничего не удвоит */
  applied: string[];
}

interface EventBase {
  /** Случайный идентификатор: по нему сервер узнаёт повтор */
  id: string;
  /** Когда событие случилось на телефоне, ISO */
  at: string;
  who: Person;
}

/** Купили на delta больше (или меньше — правка в сторону уменьшения). */
export interface PurchaseEvent extends EventBase {
  type: 'purchase';
  date: DateStr;
  product: string;
  delta: number;
}

/** В готовке использовали на delta больше (или меньше). */
export interface CookEvent extends EventBase {
  type: 'cook';
  date: DateStr;
  product: string;
  delta: number;
}

/** Поправка остатка: «дома на самом деле столько». */
export interface StockEvent extends EventBase {
  type: 'stock';
  product: string;
  value: number;
}

export type HouseholdEvent = PurchaseEvent | CookEvent | StockEvent;
