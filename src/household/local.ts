/**
 * Что лежит в телефоне про общие данные. HOUSEHOLD_SPEC, раздел 6.
 *
 * Последний ответ облака и очередь своих изменений, ещё не принятых им.
 * На экране — их сумма: ответ облака плюс очередь поверх. Так своё видно
 * сразу, а чужое приходит со следующей сводкой.
 */

import { applyEvents, emptyState, isEvent, isState } from './apply';
import type { SyncConfig } from './sync';
import { PEOPLE, type HouseholdEvent, type HouseholdState, type Person } from './types';

export const LOCAL_FORMAT = 'household-v1';

export interface HouseholdLocal {
  format: typeof LOCAL_FORMAT;
  /** Общее состояние из последнего ответа облака */
  base: HouseholdState;
  /** Свои изменения, которые облако ещё не приняло */
  outbox: HouseholdEvent[];
  /** Чей это телефон. null — ещё не выбрали */
  me: Person | null;
  /** Куда сводиться. null — облако не подключено, всё живёт в телефоне */
  sync: SyncConfig | null;
  /** Последняя удачная сводка, ISO */
  lastSyncAt: string | null;
  /** Чем кончилась последняя неудачная попытка. Удачная стирает */
  lastError: string | null;
}

export function emptyLocal(): HouseholdLocal {
  return { format: LOCAL_FORMAT, base: emptyState(), outbox: [], me: null, sync: null, lastSyncAt: null, lastError: null };
}

/** То, что показывается: облако плюс своя очередь. */
export function viewOf(local: HouseholdLocal): HouseholdState {
  return applyEvents(local.base, local.outbox).state;
}

const isPerson = (v: unknown): v is Person => PEOPLE.some((p) => p.id === v);

const isSync = (v: unknown): v is SyncConfig =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as SyncConfig).url === 'string' &&
  typeof (v as SyncConfig).key === 'string';

/**
 * Разбор файла. Непонятное поле не валит весь файл: очередь — самое ценное,
 * из неё берётся всё, что похоже на событие. null — файл не читается вовсе.
 */
export function parseLocal(text: string): HouseholdLocal | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r['format'] !== LOCAL_FORMAT) return null;
  return {
    format: LOCAL_FORMAT,
    base: isState(r['base']) ? r['base'] : emptyState(),
    outbox: Array.isArray(r['outbox']) ? r['outbox'].filter(isEvent) : [],
    me: isPerson(r['me']) ? r['me'] : null,
    sync: isSync(r['sync']) ? r['sync'] : null,
    lastSyncAt: typeof r['lastSyncAt'] === 'string' ? r['lastSyncAt'] : null,
    lastError: typeof r['lastError'] === 'string' ? r['lastError'] : null,
  };
}
