/**
 * Общие данные дома: дни, применение событий, покупки, готовка, сводка.
 * HOUSEHOLD_SPEC, разделы 3–6.
 */

import { describe, expect, it } from 'vitest';
import { APPLIED_KEEP, applyEvent, applyEvents, emptyState, isEvent, isState, prune } from '../src/household/apply';
import { cookingFor } from '../src/household/cooking';
import { addDays, weekdayOf, weekKeyOf, weekOf } from '../src/household/days';
import { emptyLocal, parseLocal, viewOf } from '../src/household/local';
import { needsOf, PLAN } from '../src/household/plan';
import { roundToPack, shoppingFor } from '../src/household/shopping';
import {
  connectionCode,
  makeKey,
  parseConnection,
  remainingOutbox,
  syncDue,
  syncOnce,
  type Post,
} from '../src/household/sync';
import type { HouseholdEvent, HouseholdState } from '../src/household/types';
import { HOUSEHOLD_FILE, HOUSEHOLD_TMP, HouseholdFiles, MemoryFiles } from '../src/storage';

let seq = 0;
const id = (): string => `event-${String(++seq).padStart(4, '0')}`;
const AT = '2026-10-05T09:00:00Z';

const buy = (date: string, product: string, delta: number, who: 'max' | 'ilvina' = 'max'): HouseholdEvent => ({
  id: id(),
  at: AT,
  who,
  type: 'purchase',
  date,
  product,
  delta,
});
const cook = (date: string, product: string, delta: number): HouseholdEvent => ({
  id: id(),
  at: AT,
  who: 'ilvina',
  type: 'cook',
  date,
  product,
  delta,
});
const stock = (product: string, value: number): HouseholdEvent => ({
  id: id(),
  at: AT,
  who: 'max',
  type: 'stock',
  product,
  value,
});

const MON = '2026-10-05';

describe('дни', () => {
  it('день недели без системных часов', () => {
    expect(weekdayOf('2026-10-01')).toBe(3); // четверг
    expect(weekKeyOf(MON)).toBe('Пн');
    expect(weekKeyOf('2026-10-11')).toBe('Вс');
    expect(weekKeyOf('2024-02-29')).toBe('Чт');
  });

  it('сдвиг через месяц, год и високосный день', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('неделя — с понедельника по воскресенье', () => {
    const week = weekOf('2026-10-08');
    expect(week[0]).toBe(MON);
    expect(week[6]).toBe('2026-10-11');
  });
});

describe('применение событий', () => {
  it('покупка добавляет в остатки и в покупки того, кто купил', () => {
    const s = applyEvents(emptyState(), [buy(MON, 'chicken', 900), buy(MON, 'chicken', 400, 'ilvina')]).state;
    expect(s.stock['chicken']).toBe(1300);
    expect(s.purchases[MON]?.['chicken']).toEqual({ max: 900, ilvina: 400 });
    expect(s.rev).toBe(2);
  });

  it('повтор того же события ничего не удваивает', () => {
    const e = buy(MON, 'onion', 500);
    const once = applyEvent(emptyState(), e);
    const twice = applyEvent(once, e);
    expect(twice).toBe(once);
    expect(applyEvents(once, [e, e]).state.stock['onion']).toBe(500);
  });

  it('правка покупки вниз не уводит в минус и не трогает чужое', () => {
    let s = applyEvents(emptyState(), [buy(MON, 'peas', 240), buy(MON, 'peas', 240, 'ilvina')]).state;
    s = applyEvent(s, buy(MON, 'peas', -1000));
    expect(s.purchases[MON]?.['peas']).toEqual({ ilvina: 240 });
    // Ушло ровно то, что было моим
    expect(s.stock['peas']).toBe(240);
  });

  it('готовка списывает остаток, но не ниже нуля, а отмена возвращает записанное', () => {
    let s = applyEvent(emptyState(), stock('potato', 500));
    s = applyEvent(s, cook(MON, 'potato', 900));
    expect(s.stock['potato']).toBeUndefined();
    expect(s.cooking[MON]?.['potato']).toBe(900);
    s = applyEvent(s, cook(MON, 'potato', -400));
    expect(s.cooking[MON]?.['potato']).toBe(500);
    expect(s.stock['potato']).toBe(400);
  });

  it('поправка остатка задаёт значение', () => {
    let s = applyEvent(emptyState(), buy(MON, 'rice', 800));
    s = applyEvent(s, stock('rice', 120));
    expect(s.stock['rice']).toBe(120);
    expect(s.purchases[MON]?.['rice']).toEqual({ max: 800 });
  });

  it('память о принятых ограничена', () => {
    let s = emptyState();
    for (let i = 0; i < APPLIED_KEEP + 5; i++) s = applyEvent(s, stock('oil', i));
    expect(s.applied).toHaveLength(APPLIED_KEEP);
  });

  it('старая история уходит, остатки остаются', () => {
    const s = applyEvents(emptyState(), [buy('2026-07-01', 'beef', 800), buy(MON, 'beef', 800)]).state;
    const pruned = prune(s, MON);
    expect(Object.keys(pruned.purchases)).toEqual([MON]);
    expect(pruned.stock['beef']).toBe(1600);
  });

  it('проверка формы пришедшего снаружи', () => {
    expect(isEvent(buy(MON, 'beef', 1))).toBe(true);
    expect(isEvent({ ...buy(MON, 'beef', 1), who: 'someone' })).toBe(false);
    expect(isEvent({ ...buy(MON, 'beef', 1), product: 'Говядина' })).toBe(false);
    expect(isEvent({ ...buy(MON, 'beef', 1), delta: 1e9 })).toBe(false);
    expect(isEvent({ ...buy(MON, 'beef', 1), date: '5 окт' })).toBe(false);
    expect(isEvent({ ...stock('oil', 1), value: -1 })).toBe(false);
    expect(isEvent({ id: 'short', type: 'stock' })).toBe(false);
    expect(isState(emptyState())).toBe(true);
    expect(isState({ rev: 1 })).toBe(false);
  });
});

describe('план', () => {
  it('семь дней, у каждого рецепта есть расход продуктов из каталога', () => {
    expect(PLAN.days.map((d) => d.key)).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
    for (const recipe of PLAN.recipes) {
      expect(Object.keys(recipe.uses).length).toBeGreaterThan(0);
      for (const product of Object.keys(recipe.uses)) expect(PLAN.catalog[product], product).toBeDefined();
    }
  });

  it('потребность дня — сумма рецептов: в понедельник чеснок и в намазку, и в карри', () => {
    expect(needsOf(PLAN, 'Пн')['garlic']).toBe(4);
    expect(needsOf(PLAN, 'Пт')).toEqual({});
  });
});

describe('покупки', () => {
  it('пустой дом: сегодняшняя готовка плюс мясо и рыба на завтра', () => {
    // Вторник: паста с креветками; в среду форель — её берут накануне
    const shop = shoppingFor(PLAN, emptyState(), '2026-10-06', 'max');
    const must = shop.must.map((r) => r.product);
    expect(must).toContain('shrimp');
    expect(must).toContain('trout');
    expect(shop.must.find((r) => r.product === 'trout')?.forTomorrow).toBe(true);
    // Картошку на среду накануне не берут
    expect(must).not.toContain('potato');
    expect(shop.pantry.map((r) => r.product)).toContain('pasta');
  });

  it('подсказка округляется до пачки', () => {
    const shrimp = PLAN.catalog['shrimp']!;
    expect(roundToPack(600, shrimp)).toBe(600);
    expect(roundToPack(601, shrimp)).toBe(800);
    expect(roundToPack(250, PLAN.catalog['onion']!)).toBe(250);
    expect(roundToPack(0, shrimp)).toBe(0);
  });

  it('купили меньше — строка частичная, больше — закрыта с запасом', () => {
    let s = applyEvent(emptyState(), buy(MON, 'chicken', 500));
    let row = shoppingFor(PLAN, s, MON, 'max').must.find((r) => r.product === 'chicken')!;
    expect(row.status).toBe('partial');
    expect(row.short).toBe(300);
    expect(row.mine).toBe(500);

    s = applyEvent(s, buy(MON, 'chicken', 400, 'ilvina'));
    row = shoppingFor(PLAN, s, MON, 'max').must.find((r) => r.product === 'chicken')!;
    expect(row.status).toBe('done');
    expect(row.got).toBe(900);
    expect(row.mine).toBe(500);
  });

  it('что уже было дома, покупать не нужно', () => {
    const s = applyEvent(emptyState(), stock('cream', 450));
    const shop = shoppingFor(PLAN, s, MON, 'max');
    expect(shop.enough.map((r) => r.product)).toContain('cream');
    expect(shop.must.map((r) => r.product)).not.toContain('cream');
  });

  it('итог «купить сегодня» считает только незакрытое', () => {
    const before = shoppingFor(PLAN, emptyState(), MON, 'max');
    const s = applyEvent(emptyState(), buy(MON, 'cottage', 130));
    const after = shoppingFor(PLAN, s, MON, 'max');
    expect(after.open).toBe(before.open - 1);
    expect(after.cost).toBeLessThan(before.cost);
  });
});

describe('готовка', () => {
  it('по умолчанию — граммовки рецептов, записанное видно', () => {
    let c = cookingFor(PLAN, emptyState(), MON);
    expect(c.recipes).toHaveLength(2);
    expect(c.recorded).toBe(false);
    expect(c.rows.find((r) => r.product === 'chicken')?.planned).toBe(800);

    const s = applyEvents(emptyState(), [buy(MON, 'chicken', 900), cook(MON, 'chicken', 850)]).state;
    c = cookingFor(PLAN, s, MON);
    expect(c.recorded).toBe(true);
    const chicken = c.rows.find((r) => r.product === 'chicken')!;
    expect(chicken.used).toBe(850);
    expect(chicken.stock).toBe(50);
  });

  it('в день без готовки — пусто', () => {
    const c = cookingFor(PLAN, emptyState(), '2026-10-09');
    expect(c.recipes).toEqual([]);
    expect(c.rows).toEqual([]);
  });
});

describe('сводка с облаком', () => {
  const config = { url: 'https://functions.yandexcloud.net/abc', key: 'k'.repeat(24) };

  /** Облако в памяти: применяет события по одному, как настоящее. */
  function fakeCloud(): { post: Post; state: () => HouseholdState; calls: () => number } {
    let state = emptyState();
    let calls = 0;
    const post: Post = async (_url, headers, body) => {
      calls++;
      if (headers['X-Household-Key'] !== config.key) return { status: 403, data: { error: 'нет' } };
      const events = (body as { events: HouseholdEvent[] }).events;
      const result = applyEvents(state, events);
      state = result.state;
      return { status: 200, data: JSON.stringify({ state, acked: result.acked }) };
    };
    return { post, state: () => state, calls: () => calls };
  }

  it('очередь уходит, приходит общее состояние', async () => {
    const cloud = fakeCloud();
    const events = [buy(MON, 'beef', 800)];
    const outcome = await syncOnce(cloud.post, config, events);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.stock['beef']).toBe(800);
    expect(remainingOutbox(events, outcome.acked)).toEqual([]);
  });

  it('ответ потерялся — повтор той же очереди не удваивает', async () => {
    const cloud = fakeCloud();
    const events = [buy(MON, 'beef', 800)];
    await syncOnce(cloud.post, config, events);
    await syncOnce(cloud.post, config, events);
    expect(cloud.state().stock['beef']).toBe(800);
  });

  it('два телефона по очереди: изменения складываются', async () => {
    const cloud = fakeCloud();
    await syncOnce(cloud.post, config, [buy(MON, 'onion', 200, 'max')]);
    const second = await syncOnce(cloud.post, config, [buy(MON, 'onion', 300, 'ilvina')]);
    expect(second.ok && second.state.stock['onion']).toBe(500);
  });

  it('нет связи, чужой ключ, непонятный ответ — понятные сообщения', async () => {
    const offline: Post = async () => {
      throw new Error('offline');
    };
    const wrong = await syncOnce(fakeCloud().post, { ...config, key: 'x'.repeat(24) }, []);
    const broken: Post = async () => ({ status: 200, data: '<html>' });
    const failing: Post = async () => ({ status: 500, data: { error: 'База недоступна' } });

    expect(await syncOnce(offline, config, [])).toMatchObject({ ok: false, message: expect.stringContaining('Нет связи') });
    expect(wrong).toMatchObject({ ok: false, message: expect.stringContaining('ключ') });
    expect(await syncOnce(broken, config, [])).toMatchObject({ ok: false, message: 'Облако прислало непонятный ответ' });
    expect(await syncOnce(failing, config, [])).toMatchObject({ ok: false, message: 'База недоступна' });
  });

  it('пора ли сводиться: раз в сутки после границы', () => {
    expect(syncDue(null, 1000)).toBe(true);
    expect(syncDue(999, 1000)).toBe(true);
    expect(syncDue(1000, 1000)).toBe(false);
  });

  it('код подключения туда и обратно', () => {
    const code = connectionCode(config);
    expect(parseConnection(`  ${code}\n`)).toEqual(config);
    expect(parseConnection('http://insecure#' + 'k'.repeat(24))).toBeNull();
    expect(parseConnection('https://x.ru#short')).toBeNull();
    expect(parseConnection('https://x.ru')).toBeNull();
  });

  it('ключ — из переданной случайности, нужной длины и алфавита', () => {
    const key = makeKey((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(key).toHaveLength(24);
    expect(key).toMatch(/^[A-Za-z0-9]+$/);
  });
});

describe('файл в телефоне', () => {
  it('экран — облако плюс своя очередь', () => {
    const local = { ...emptyLocal(), base: applyEvent(emptyState(), stock('rice', 100)), outbox: [buy(MON, 'rice', 800)] };
    expect(viewOf(local).stock['rice']).toBe(900);
  });

  it('пишется атомарно и читается обратно', async () => {
    const files = new MemoryFiles();
    const repo = new HouseholdFiles(files);
    const local = { ...emptyLocal(), me: 'ilvina' as const, outbox: [buy(MON, 'eggs', 10, 'ilvina')] };
    await Promise.all([repo.save({ ...local, me: 'max' }), repo.save(local)]);
    expect(files.has(HOUSEHOLD_TMP)).toBe(false);
    const loaded = await new HouseholdFiles(files).load();
    expect(loaded.local.me).toBe('ilvina');
    expect(loaded.local.outbox).toHaveLength(1);
    expect(files.has('budget.json')).toBe(false);
  });

  it('нечитаемый файл откладывается, работа начинается с чистого листа', async () => {
    const files = new MemoryFiles();
    await files.write(HOUSEHOLD_FILE, '{"format":"household-v1", обрыв');
    const loaded = await new HouseholdFiles(files).load();
    expect(loaded.local).toEqual(emptyLocal());
    expect(loaded.note).toMatch(/не прочитался/);
    expect(files.has(HOUSEHOLD_FILE)).toBe(false);
  });

  it('мусор в очереди отбрасывается, годное остаётся', () => {
    const good = buy(MON, 'eggs', 10);
    const text = JSON.stringify({ ...emptyLocal(), outbox: [good, { junk: true }], me: 'кто-то' });
    const local = parseLocal(text)!;
    expect(local.outbox).toEqual([good]);
    expect(local.me).toBeNull();
  });
});
