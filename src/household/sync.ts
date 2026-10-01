/**
 * Отправка очереди в облако и приём общего состояния. HOUSEHOLD_SPEC, раздел 6.
 *
 * Телефон шлёт не данные, а свои события. Облако применяет их по одному
 * и возвращает свежее общее состояние и список принятых событий. Принятое
 * убирается из очереди; созданное, пока шёл запрос, остаётся и уйдёт
 * в следующий раз. Ответ не пришёл — очередь цела, ничего не потеряно.
 */

import { isState } from './apply';
import type { HouseholdEvent, HouseholdState } from './types';

export interface SyncConfig {
  url: string;
  key: string;
}

export type Post = (url: string, headers: Record<string, string>, body: unknown) => Promise<{ status: number; data: unknown }>;

export type SyncOutcome =
  | { ok: true; state: HouseholdState; acked: string[] }
  | { ok: false; message: string };

export const KEY_HEADER = 'X-Household-Key';

/** Больше событий за один запрос телефон не шлёт: длинная очередь уходит пачками. */
export const SYNC_BATCH = 200;

export async function syncOnce(post: Post, config: SyncConfig, outbox: HouseholdEvent[]): Promise<SyncOutcome> {
  let response: { status: number; data: unknown };
  try {
    response = await post(config.url, { [KEY_HEADER]: config.key }, { events: outbox });
  } catch {
    return { ok: false, message: 'Нет связи с облаком. Изменения сохранены в телефоне и уйдут позже' };
  }
  const data = typeof response.data === 'string' ? tryParse(response.data) : response.data;
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: 'Облако не приняло ключ. Проверьте ключ в настройках синхронизации' };
  }
  if (response.status !== 200) {
    const message = (data as { error?: unknown } | null)?.error;
    return { ok: false, message: typeof message === 'string' ? message : `Облако ответило ошибкой ${response.status}` };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, message: 'Облако прислало непонятный ответ' };
  const { state, acked } = data as { state?: unknown; acked?: unknown };
  if (!isState(state) || !Array.isArray(acked) || !acked.every((id) => typeof id === 'string')) {
    return { ok: false, message: 'Облако прислало непонятный ответ' };
  }
  return { ok: true, state, acked };
}

/** Очередь после ответа: принятое уходит, остальное остаётся. */
export function remainingOutbox(outbox: HouseholdEvent[], acked: string[]): HouseholdEvent[] {
  const done = new Set(acked);
  return outbox.filter((e) => !done.has(e.id));
}

/**
 * Пора ли сводиться самим: раз в сутки, после 3 часов ночи. boundary —
 * последние наступившие 3:00 по местному времени.
 */
export function syncDue(lastSyncMs: number | null, boundaryMs: number): boolean {
  return lastSyncMs === null || lastSyncMs < boundaryMs;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Код подключения — адрес функции и ключ одной строкой: «https://…#ключ».
 * Его создают на одном телефоне и пересылают на второй — вставить одно
 * поле проще, чем два.
 */
export function connectionCode(config: SyncConfig): string {
  return `${config.url}#${config.key}`;
}

const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function parseConnection(code: string): SyncConfig | null {
  const text = code.trim();
  const hash = text.lastIndexOf('#');
  if (hash < 0) return null;
  const url = text.slice(0, hash).trim();
  const key = text.slice(hash + 1).trim();
  if (!/^https:\/\/[^\s#]+$/.test(url) || !KEY_RE.test(key)) return null;
  return { url, key };
}

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Ключ из случайных байт. Источник случайности передаётся снаружи. */
export function makeKey(random: (n: number) => Uint8Array, length = 24): string {
  const bytes = random(length);
  let out = '';
  for (const b of bytes) out += KEY_ALPHABET[b % KEY_ALPHABET.length];
  return out;
}
