/**
 * Общие данные в приложении: очередь, пачки, сводка раз в сутки.
 * HOUSEHOLD_SPEC, раздел 6.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createHandler, type StateStore } from '../cloud/src/handler';
import type { Post } from '../src/household/sync';
import { SYNC_BATCH } from '../src/household/sync';
import type { HouseholdState } from '../src/household/types';
import { HouseholdFiles, MemoryFiles } from '../src/storage';
import { lastBoundary, useHousehold } from '../src/store/household';

const KEY = 'store-test-key-0123456789';
const DAY = '2026-10-05';

function cloud(): { post: Post; calls: number[]; state: () => HouseholdState | null } {
  let saved: HouseholdState | null = null;
  const store: StateStore = {
    load: async () => saved && structuredClone(saved),
    save: async (state, expected) => {
      if ((saved?.rev ?? null) !== expected) return false;
      saved = structuredClone(state);
      return true;
    },
  };
  const handle = createHandler({ store, key: KEY, today: () => DAY });
  const calls: number[] = [];
  const post: Post = async (_url, headers, body) => {
    calls.push((body as { events: unknown[] }).events.length);
    const r = await handle({ method: 'POST', headers, body: JSON.stringify(body) });
    return { status: r.statusCode, data: r.body };
  };
  return { post, calls, state: () => saved };
}

async function fresh(post: Post): Promise<{ files: MemoryFiles; repo: HouseholdFiles }> {
  const files = new MemoryFiles();
  const repo = new HouseholdFiles(files);
  await useHousehold.getState().init(repo, post);
  return { files, repo };
}

describe('общие данные в приложении', () => {
  beforeEach(() => {
    useHousehold.setState(useHousehold.getInitialState());
  });

  it('правка покупки — разница к своему итогу, а не новая покупка', async () => {
    await fresh(cloud().post);
    const s = useHousehold.getState();
    s.setMe('max');
    s.setPurchase(DAY, 'chicken', 900);
    s.setPurchase(DAY, 'chicken', 600);
    s.setPurchase(DAY, 'chicken', 600);
    const { local, view } = useHousehold.getState();
    expect(local.outbox.map((e) => (e.type === 'purchase' ? e.delta : null))).toEqual([900, -300]);
    expect(view.stock['chicken']).toBe(600);
    expect(local.outbox[0]!.id).toHaveLength(16);
  });

  it('без выбранного хозяина телефона ничего не записывается', async () => {
    await fresh(cloud().post);
    useHousehold.getState().setPurchase(DAY, 'chicken', 900);
    expect(useHousehold.getState().local.outbox).toEqual([]);
  });

  it('готовка: записывается разница с уже записанным по каждому продукту', async () => {
    await fresh(cloud().post);
    const s = useHousehold.getState();
    s.setMe('ilvina');
    s.setCooked(DAY, { potato: 900, peas: 160 });
    s.setCooked(DAY, { potato: 800, peas: 160 });
    const deltas = useHousehold.getState().local.outbox.map((e) => (e.type === 'cook' ? [e.product, e.delta] : null));
    expect(deltas).toEqual([
      ['potato', 900],
      ['peas', 160],
      ['potato', -100],
    ]);
  });

  it('длинная очередь уходит пачками и вся принимается', async () => {
    const c = cloud();
    const { files, repo } = await fresh(c.post);
    const s = useHousehold.getState();
    s.setMe('max');
    s.setSync({ url: 'https://example/fn', key: KEY });
    for (let i = 1; i <= SYNC_BATCH * 2 + 50; i++) s.setPurchase(DAY, 'onion', i);
    expect(await useHousehold.getState().syncNow()).toBeNull();
    expect(c.calls).toEqual([SYNC_BATCH, SYNC_BATCH, 50]);
    const { local, view } = useHousehold.getState();
    expect(local.outbox).toEqual([]);
    expect(local.lastError).toBeNull();
    expect(view.stock['onion']).toBe(SYNC_BATCH * 2 + 50);
    expect(c.state()?.stock['onion']).toBe(SYNC_BATCH * 2 + 50);
    // И в файле то же самое
    await repo.idle();
    const saved = JSON.parse((files.peek('household.json') ?? '{}') as string) as { outbox: unknown[] };
    expect(saved.outbox).toEqual([]);
  });

  it('облако не ответило — очередь цела, ошибка видна', async () => {
    const offline: Post = async () => {
      throw new Error('offline');
    };
    await fresh(offline);
    const s = useHousehold.getState();
    s.setMe('max');
    s.setSync({ url: 'https://example/fn', key: KEY });
    s.setPurchase(DAY, 'rice', 800);
    const error = await useHousehold.getState().syncNow();
    expect(error).toMatch(/Нет связи/);
    expect(useHousehold.getState().local.outbox).toHaveLength(1);
    expect(useHousehold.getState().syncing).toBe(false);
  });

  it('сам сводится раз в сутки: после трёх ночи, если сегодня ещё не сводился', async () => {
    const c = cloud();
    await fresh(c.post);
    const s = useHousehold.getState();
    s.setSync({ url: 'https://example/fn', key: KEY });
    await s.autoSync(new Date(2026, 9, 5, 9, 0));
    expect(c.calls).toHaveLength(1);
    // Сводка записала своё время по настоящим часам — подменяем на утро 5-го
    const synced = (): void =>
      useHousehold.setState({ local: { ...useHousehold.getState().local, lastSyncAt: new Date(2026, 9, 5, 9, 0).toISOString() } });
    synced();
    // Тот же день — уже сводились
    await useHousehold.getState().autoSync(new Date(2026, 9, 5, 23, 0));
    expect(c.calls).toHaveLength(1);
    // Следующая ночь до трёх — ещё рано
    await useHousehold.getState().autoSync(new Date(2026, 9, 6, 2, 30));
    expect(c.calls).toHaveLength(1);
    await useHousehold.getState().autoSync(new Date(2026, 9, 6, 3, 5));
    expect(c.calls).toHaveLength(2);
  });

  it('граница суток — последние наступившие три часа ночи', () => {
    expect(lastBoundary(new Date(2026, 9, 6, 2, 59))).toBe(new Date(2026, 9, 5, 3, 0).getTime());
    expect(lastBoundary(new Date(2026, 9, 6, 3, 0))).toBe(new Date(2026, 9, 6, 3, 0).getTime());
  });
});
