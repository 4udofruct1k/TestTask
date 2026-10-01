/**
 * Общие данные дома в приложении: покупки, готовка, остатки. Zustand.
 * HOUSEHOLD_SPEC, разделы 4–6.
 *
 * Каждое действие — событие в очередь: «купил ещё 800 г», а не «теперь
 * куплено столько». Очередь сразу пишется в файл и показывается поверх
 * последнего ответа облака. В облако уходит при сводке: сама — раз в сутки,
 * при первом открытии после трёх ночи; или по кнопке «Обновить».
 */

import { create } from 'zustand';
import { emptyState } from '../household/apply';
import type { DateStr } from '../household/days';
import { emptyLocal, viewOf, type HouseholdLocal } from '../household/local';
import { makeKey, remainingOutbox, SYNC_BATCH, syncDue, syncOnce, type Post, type SyncConfig } from '../household/sync';
import type { HouseholdEvent, HouseholdState, Person } from '../household/types';
import type { HouseholdFiles } from '../storage';
import { nowIso, todayString } from '../ui/clock';

/** Час, после которого телефон сводится сам при первом открытии. */
export const SYNC_HOUR = 3;

/** Последние наступившие 3:00 по местному времени, мс. */
export function lastBoundary(now: Date): number {
  const boundary = new Date(now);
  boundary.setHours(SYNC_HOUR, 0, 0, 0);
  if (now.getTime() < boundary.getTime()) boundary.setDate(boundary.getDate() - 1);
  return boundary.getTime();
}

/** Событие без того, что проставляется при записи. */
type Draft = HouseholdEvent extends infer E ? (E extends HouseholdEvent ? Omit<E, 'id' | 'at' | 'who'> : never) : never;

/** Идентификатор события: 16 случайных знаков — коротко, а запись в облаке одна на всё. */
const eventId = (): string => makeKey((n) => crypto.getRandomValues(new Uint8Array(n)), 16);

/** Отбрасывание шума дробей: граммы и штуки — до сотых. */
const round = (v: number): number => Math.round(v * 100) / 100;

interface HouseholdStore {
  ready: boolean;
  local: HouseholdLocal;
  /** Облако плюс своя очередь — то, что на экране */
  view: HouseholdState;
  today: DateStr;
  syncing: boolean;
  /** Ошибка записи файла: изменения не сохранились бы при закрытии */
  saveError: string | null;
  /** Что случилось при загрузке, если файл пришлось отложить */
  loadNote: string | null;

  init(files: HouseholdFiles, post: Post): Promise<void>;
  /** День сменился, пока приложение висело в памяти */
  refreshToday(): void;
  setMe(person: Person): void;
  setSync(config: SyncConfig | null): void;
  /** Сколько я купил продукта за день всего. Итог, а не добавка */
  setPurchase(date: DateStr, product: string, myTotal: number): void;
  /** Сколько ушло в готовку за день: продукт → итог */
  setCooked(date: DateStr, used: Record<string, number>): void;
  /** «Дома на самом деле столько» */
  setStock(product: string, value: number): void;
  /** Свести с облаком. Возвращает текст ошибки или null */
  syncNow(): Promise<string | null>;
  /** Свести, если сегодня после трёх ночи ещё не сводились */
  autoSync(now?: Date): Promise<void>;
}

let storage: HouseholdFiles | null = null;
let send: Post | null = null;

export const useHousehold = create<HouseholdStore>()((set, get) => {
  const persist = (local: HouseholdLocal): void => {
    set({ local, view: viewOf(local) });
    void storage?.save(local).then((result) => set({ saveError: result.ok ? null : result.message }));
  };

  const push = (events: Draft[]): void => {
    const { local } = get();
    if (!local.me || events.length === 0) return;
    const at = nowIso();
    const who = local.me;
    const full = events.map((e) => ({ ...e, id: eventId(), at, who }) as HouseholdEvent);
    persist({ ...local, outbox: [...local.outbox, ...full] });
  };

  return {
    ready: false,
    local: emptyLocal(),
    view: emptyState(),
    today: todayString(),
    syncing: false,
    saveError: null,
    loadNote: null,

    async init(files, post) {
      storage = files;
      send = post;
      const { local, note } = await files.load();
      set({ ready: true, local, view: viewOf(local), loadNote: note, today: todayString() });
      await get().autoSync();
    },

    refreshToday() {
      const today = todayString();
      if (today !== get().today) set({ today });
    },

    setMe(me) {
      persist({ ...get().local, me });
    },

    setSync(sync) {
      persist({ ...get().local, sync, lastError: null });
    },

    setPurchase(date, product, myTotal) {
      const { view, local } = get();
      if (!local.me) return;
      const before = view.purchases[date]?.[product]?.[local.me] ?? 0;
      const delta = round(Math.max(0, myTotal) - before);
      if (delta === 0) return;
      push([{ type: 'purchase', date, product, delta }]);
    },

    setCooked(date, used) {
      const done = get().view.cooking[date] ?? {};
      const events = Object.entries(used)
        .map(([product, total]) => ({ product, delta: round(Math.max(0, total) - (done[product] ?? 0)) }))
        .filter((e) => e.delta !== 0)
        .map((e) => ({ type: 'cook' as const, date, product: e.product, delta: e.delta }));
      push(events);
    },

    setStock(product, value) {
      push([{ type: 'stock', product, value: round(Math.max(0, value)) }]);
    },

    async syncNow() {
      const { local, syncing } = get();
      if (syncing) return null;
      if (!local.sync || !send) return 'Облако не подключено';
      set({ syncing: true });
      try {
        // Очередь уходит пачками. Первая пачка уходит и пустой — за общим
        // состоянием. Что добавят за время запроса — уйдёт в следующий раз
        for (;;) {
          const current = get().local;
          if (!current.sync) return 'Облако не подключено';
          const batch = current.outbox.slice(0, SYNC_BATCH);
          const outcome = await syncOnce(send, current.sync, batch);
          const latest = get().local;
          if (!outcome.ok) {
            persist({ ...latest, lastError: outcome.message });
            return outcome.message;
          }
          persist({
            ...latest,
            base: outcome.state,
            outbox: remainingOutbox(latest.outbox, outcome.acked),
            lastSyncAt: nowIso(),
            lastError: null,
          });
          // Облако ничего не приняло — по кругу не гоняем, остаток уйдёт в следующий раз
          if (batch.length < SYNC_BATCH || outcome.acked.length === 0) return null;
        }
      } finally {
        set({ syncing: false });
      }
    },

    async autoSync(now = new Date()) {
      const { local, ready } = get();
      if (!ready || !local.sync) return;
      const last = local.lastSyncAt ? Date.parse(local.lastSyncAt) : null;
      if (!syncDue(Number.isNaN(last) ? null : last, lastBoundary(now))) return;
      await get().syncNow();
    },
  };
});
