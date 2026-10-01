/**
 * Облачная функция: ключ, очередь, одновременная запись, база.
 * HOUSEHOLD_SPEC, раздел 7.
 */

import { describe, expect, it } from 'vitest';
import { docApiStore } from '../cloud/src/docapi';
import { createHandler, type Request, type StateStore } from '../cloud/src/handler';
import { emptyState } from '../src/household/apply';
import type { HouseholdEvent, HouseholdState } from '../src/household/types';

const KEY = 'test-key-0123456789abcdef';
const TODAY = '2026-10-05';

let seq = 0;
const buy = (product: string, delta: number, who: 'max' | 'ilvina' = 'max'): HouseholdEvent => ({
  id: `cloud-${String(++seq).padStart(4, '0')}`,
  at: '2026-10-05T09:00:00Z',
  who,
  type: 'purchase',
  date: TODAY,
  product,
  delta,
});

/** База в памяти с проверкой версии, как у Document API. */
class MemoryStore implements StateStore {
  state: HouseholdState | null = null;
  saves = 0;
  /** Вклиниться между чтением и записью: будто второй телефон успел раньше */
  beforeSave: (() => void) | null = null;

  async load(): Promise<HouseholdState | null> {
    return this.state && structuredClone(this.state);
  }

  async save(state: HouseholdState, expectedRev: number | null): Promise<boolean> {
    const hook = this.beforeSave;
    this.beforeSave = null;
    hook?.();
    const current = this.state === null ? null : this.state.rev;
    if (current !== expectedRev) return false;
    this.state = structuredClone(state);
    this.saves++;
    return true;
  }
}

const post = (events: unknown[], key = KEY): Request => ({
  method: 'POST',
  headers: { 'x-household-key': key, 'content-type': 'application/json' },
  body: JSON.stringify({ events }),
});

describe('облачная функция', () => {
  it('принимает очередь и отдаёт общее состояние', async () => {
    const store = new MemoryStore();
    const handle = createHandler({ store, key: KEY, today: () => TODAY });
    const events = [buy('beef', 800), buy('onion', 300, 'ilvina')];
    const response = await handle(post(events));
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body) as { state: HouseholdState; acked: string[] };
    expect(data.state.stock).toEqual({ beef: 800, onion: 300 });
    expect(data.acked).toEqual(events.map((e) => e.id));
    expect(store.state?.rev).toBe(2);
  });

  it('без ключа или с чужим — отказ, база не тронута', async () => {
    const store = new MemoryStore();
    const handle = createHandler({ store, key: KEY, today: () => TODAY });
    expect((await handle(post([buy('beef', 1)], 'wrong-key-0123456789'))).statusCode).toBe(403);
    expect((await handle({ ...post([buy('beef', 1)]), headers: {} })).statusCode).toBe(403);
    expect(store.saves).toBe(0);
  });

  it('ключ в функции не задан — понятная ошибка', async () => {
    const handle = createHandler({ store: new MemoryStore(), key: undefined, today: () => TODAY });
    const response = await handle(post([]));
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('HOUSEHOLD_KEY');
  });

  it('предварительный запрос браузера получает разрешения', async () => {
    const handle = createHandler({ store: new MemoryStore(), key: KEY, today: () => TODAY });
    const response = await handle({ method: 'OPTIONS', headers: {}, body: '' });
    expect(response.statusCode).toBe(204);
    expect(response.headers['Access-Control-Allow-Headers']).toContain('X-Household-Key');
  });

  it('повтор той же очереди не пишет в базу второй раз', async () => {
    const store = new MemoryStore();
    const handle = createHandler({ store, key: KEY, today: () => TODAY });
    const events = [buy('rice', 800)];
    await handle(post(events));
    const again = JSON.parse((await handle(post(events))).body) as { state: HouseholdState; acked: string[] };
    expect(again.state.stock['rice']).toBe(800);
    expect(again.acked).toEqual([events[0]!.id]);
    expect(store.saves).toBe(1);
  });

  it('второй телефон записал раньше — функция перечитывает и складывает', async () => {
    const store = new MemoryStore();
    const handle = createHandler({ store, key: KEY, today: () => TODAY });
    await handle(post([buy('potato', 1000)]));
    // Пока функция считала, Ильвина успела свести своё
    store.beforeSave = () => {
      store.state = { ...store.state!, rev: store.state!.rev + 1, stock: { ...store.state!.stock, carrot: 500 } };
    };
    const response = await handle(post([buy('potato', 600)]));
    const data = JSON.parse(response.body) as { state: HouseholdState };
    expect(data.state.stock).toEqual({ potato: 1600, carrot: 500 });
    expect(store.state?.stock).toEqual({ potato: 1600, carrot: 500 });
  });

  it('непонятные события подтверждаются и отбрасываются, годные применяются', async () => {
    const store = new MemoryStore();
    const handle = createHandler({ store, key: KEY, today: () => TODAY });
    const good = buy('eggs', 10);
    const bad = { ...buy('eggs', 10), product: 'ЯЙЦА' };
    const data = JSON.parse((await handle(post([good, bad]))).body) as { state: HouseholdState; acked: string[] };
    expect(data.acked).toEqual([good.id, bad.id]);
    expect(data.state.stock['eggs']).toBe(10);
  });

  it('тело не JSON — 400', async () => {
    const handle = createHandler({ store: new MemoryStore(), key: KEY, today: () => TODAY });
    expect((await handle({ ...post([]), body: 'привет' })).statusCode).toBe(400);
  });

  it('база недоступна — 502 с причиной', async () => {
    const store: StateStore = {
      load: async () => {
        throw new Error('нет доступа');
      },
      save: async () => true,
    };
    const response = await createHandler({ store, key: KEY, today: () => TODAY })(post([]));
    expect(response.statusCode).toBe(502);
    expect(response.body).toContain('нет доступа');
  });
});

describe('Document API', () => {
  type Call = { target: string; body: Record<string, unknown>; auth: string };

  /** Таблица в памяти, отвечающая так же, как Document API. */
  function fakeDocApi(options: { tableExists: boolean }) {
    const calls: Call[] = [];
    let exists = options.tableExists;
    let item: Record<string, { S?: string; N?: string }> | null = null;
    const reply = (status: number, data: unknown): Response =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/x-amz-json-1.0' } });

    const send = async (_url: string | URL | globalThis.Request, init?: RequestInit): Promise<Response> => {
      const headers = init?.headers as Record<string, string>;
      const target = headers['X-Amz-Target']!.split('.')[1]!;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ target, body, auth: headers['Authorization']! });
      const missing = { __type: 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException', message: 'нет таблицы' };
      if (target === 'CreateTable') {
        exists = true;
        return reply(200, {});
      }
      if (!exists) return reply(400, missing);
      if (target === 'GetItem') return reply(200, item ? { Item: item } : {});
      if (target === 'PutItem') {
        const values = body['ExpressionAttributeValues'] as Record<string, { N: string }> | undefined;
        const ok = values ? item?.['version']?.N === values[':v']!.N : item === null;
        if (!ok) {
          return reply(400, { __type: 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException', message: 'условие' });
        }
        item = body['Item'] as Record<string, { S?: string; N?: string }>;
        return reply(200, {});
      }
      return reply(400, { message: 'неизвестно' });
    };
    return { send: send as typeof fetch, calls };
  }

  it('пустая база — null; запись с проверкой версии; чужая версия — false', async () => {
    const api = fakeDocApi({ tableExists: true });
    const store = docApiStore({ endpoint: 'https://docapi.example/db', table: 'household', token: () => 'iam', fetch: api.send });
    expect(await store.load()).toBeNull();

    const first = { ...emptyState(), rev: 1, stock: { beef: 800 } };
    expect(await store.save(first, null)).toBe(true);
    expect(await store.save({ ...first, rev: 2 }, null)).toBe(false);
    expect(await store.load()).toEqual(first);
    expect(await store.save({ ...first, rev: 2 }, 1)).toBe(true);
    expect(await store.save({ ...first, rev: 3 }, 1)).toBe(false);
    expect(api.calls.every((c) => c.auth === 'Bearer iam')).toBe(true);
  });

  it('таблицы нет — функция создаёт её сама', async () => {
    const api = fakeDocApi({ tableExists: false });
    const store = docApiStore({ endpoint: 'https://docapi.example/db', table: 'household', token: () => 'iam', fetch: api.send });
    expect(await store.load()).toBeNull();
    expect(api.calls.map((c) => c.target)).toEqual(['GetItem', 'CreateTable', 'GetItem']);
  });

  it('вся связка: функция поверх Document API', async () => {
    const api = fakeDocApi({ tableExists: true });
    const store = docApiStore({ endpoint: 'https://docapi.example/db', table: 'household', token: () => 'iam', fetch: api.send });
    const handle = createHandler({ store, key: KEY, today: () => TODAY });
    await handle(post([buy('trout', 700)]));
    const data = JSON.parse((await handle(post([buy('trout', 700, 'ilvina')]))).body) as { state: HouseholdState };
    expect(data.state.stock['trout']).toBe(1400);
    expect(data.state.purchases[TODAY]?.['trout']).toEqual({ max: 700, ilvina: 700 });
  });
});
