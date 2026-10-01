/**
 * Облачная функция «Дома на двоих». HOUSEHOLD_SPEC, раздел 7.
 *
 * Принимает очередь событий с телефона, применяет их к общему состоянию
 * строго по одному и возвращает свежее состояние. Запись в базу —
 * с проверкой версии: если второй телефон успел записать раньше, функция
 * перечитывает состояние и применяет очередь заново. Поэтому одновременная
 * сводка двух телефонов ничего не теряет, а повтор очереди ничего не удваивает.
 *
 * Здесь нет ни сети, ни часов: база и дата приходят снаружи — так функция
 * проверяется тестами без облака.
 */

import { applyEvents, emptyState, isEvent, prune } from '../../src/household/apply';
import { KEY_HEADER } from '../../src/household/sync';
import type { HouseholdState } from '../../src/household/types';

export interface StateStore {
  /** null — записи ещё нет: первая сводка */
  load(): Promise<HouseholdState | null>;
  /**
   * Записать, если в базе всё ещё версия expectedRev (null — записи нет).
   * false — кто-то записал раньше, нужно перечитать.
   */
  save(state: HouseholdState, expectedRev: number | null): Promise<boolean>;
}

export interface Request {
  method: string;
  headers: Record<string, string | undefined>;
  body: string;
}

export interface Response {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface HandlerOptions {
  store: StateStore;
  /** Ключ из настроек функции. Пусто — функция не настроена */
  key: string | undefined;
  /** Сегодняшняя дата для очистки старой истории */
  today: () => string;
}

/** Сколько раз перечитать при одновременной записи. */
const ATTEMPTS = 5;
/** Телефон шлёт пачками по SYNC_BATCH; это запас сверху. */
const MAX_EVENTS = 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': `Content-Type, ${KEY_HEADER}`,
  'Access-Control-Max-Age': '86400',
};

const json = (statusCode: number, data: unknown): Response => ({
  statusCode,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(data),
});

/** Сравнение без раннего выхода: по времени ответа ключ не подобрать. */
function sameKey(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === wanted) return v;
  return undefined;
}

export function createHandler({ store, key, today }: HandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
    if (request.method === 'GET') return json(200, { ok: true, service: 'household' });
    if (request.method !== 'POST') return json(405, { error: 'Нужен POST' });

    if (!key || key.length < 16) {
      return json(500, { error: 'В функции не задан ключ: переменная окружения HOUSEHOLD_KEY' });
    }
    const given = header(request.headers, KEY_HEADER) ?? '';
    if (!sameKey(given, key)) return json(403, { error: 'Неверный ключ' });

    let raw: unknown;
    try {
      raw = JSON.parse(request.body || '{}');
    } catch {
      return json(400, { error: 'Тело запроса — не JSON' });
    }
    const list = (raw as { events?: unknown }).events;
    if (!Array.isArray(list) || list.length > MAX_EVENTS) return json(400, { error: 'Нет списка событий' });

    // Непонятное событие подтверждается и отбрасывается: иначе оно навсегда
    // застрянет в очереди телефона и будет приходить с каждой сводкой
    const events = list.filter(isEvent);
    const acked = list
      .map((e) => (typeof e === 'object' && e !== null ? (e as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string');

    try {
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const stored = await store.load();
        const base = stored ?? emptyState();
        const applied = applyEvents(base, events).state;
        const next = prune(applied, today());
        // Нечего записывать — повтор или пустая очередь: просто отдать состояние
        if (stored !== null && next.rev === stored.rev) return json(200, { state: next, acked });
        if (await store.save(next, stored === null ? null : stored.rev)) return json(200, { state: next, acked });
      }
      return json(503, { error: 'База занята, попробуйте ещё раз' });
    } catch (error) {
      return json(502, { error: error instanceof Error ? error.message : 'База недоступна' });
    }
  };
}
