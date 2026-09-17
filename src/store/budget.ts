/**
 * Документ и мутации. Zustand.
 *
 * Каждая мутация создаёт новый объект документа: индексы движка висят
 * на ссылке документа и не должны протухать (4.8).
 */

import { create } from 'zustand';
import { addMonths, compareMonth, monthKeyOf } from '../domain/dates';
import { createInitialDocument } from '../domain/defaults';
import type {
  BudgetDocument,
  Contribution,
  DateStr,
  Expense,
  FixedItem,
  Flow,
  Kind,
  Money,
  MonthKey,
  MonthOverride,
  SavingsGoal,
  Settings,
} from '../domain/types';
import type { Fix } from '../domain/validate';
import { wasActiveBefore } from '../engine';
import { BudgetRepository } from '../storage';
import { makeId, nowIso, todayString } from '../ui/clock';

/** Полоса «Вернуть» живёт 4,5 секунды (3.3). */
export const UNDO_MS = 4500;
/** Защита от дублей в шторке быстрого ввода (3.3). */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export type Status = 'loading' | 'ready' | 'onboarding' | 'error';

interface UndoEntry {
  label: string;
  doc: BudgetDocument;
  at: number;
}

interface BudgetState {
  status: Status;
  doc: BudgetDocument | null;
  today: DateStr;
  journal: Fix[];
  error: string | null;
  restoredFrom: string | null;
  undoEntry: UndoEntry | null;

  init(repository: BudgetRepository): Promise<void>;
  startFresh(): void;

  addExpense(input: {
    date: DateStr;
    amount: Money;
    categoryId: string;
    flow?: Flow;
    note?: string;
  }): void;
  updateExpense(id: string, patch: Partial<Pick<Expense, 'date' | 'amount' | 'categoryId' | 'flow' | 'note'>>): void;
  removeExpense(id: string): void;
  findRecentDuplicate(amount: Money, categoryId: string): Expense | null;

  addFixedMonthly(input: {
    title: string;
    kind: Kind;
    categoryId: string;
    amount: Money;
    fromMonth: MonthKey;
    note?: string;
  }): void;
  addFixedSpread(input: {
    title: string;
    categoryId: string;
    totalAmount: Money;
    months: number;
    fromMonth: MonthKey;
    payMonth?: MonthKey;
    payDay?: number;
  }): void;
  /** «Изменить с апреля» — новая запись, прошлое не трогается (3.4) */
  changeFixedAmount(id: string, fromMonth: MonthKey, amount: Money): void;
  /** «Исправить ошибку» — правка действующей записи, пересчитает закрытые месяцы */
  correctFixedAmount(id: string, fromMonth: MonthKey, amount: Money): void;
  /** Пропустить платёж в одном месяце */
  skipFixedMonth(id: string, month: MonthKey): void;
  /** Разовое отклонение суммы в одном месяце */
  overrideFixedAmount(id: string, month: MonthKey, amount: Money): void;
  /** «Удалить» — действует с текущего месяца вперёд, прошлое остаётся */
  endFixedItem(id: string, month: MonthKey): void;
  /** «Исправить ошибку» — стирает позицию вместе с прошлым. Отдельное действие с предупреждением (3.3) */
  eraseFixedItem(id: string): void;

  addGoal(input: { title: string; targetAmount: Money; deadline?: MonthKey }): void;
  addContribution(goalId: string, month: MonthKey, amount: Money, note?: string): void;
  archiveGoal(goalId: string): void;
  removeContribution(goalId: string, contributionId: string): void;

  setMonthlyTarget(fromMonth: MonthKey, amount: Money): void;
  correctMonthlyTarget(fromMonth: MonthKey, amount: Money): void;
  updateSettings(patch: Partial<Omit<Settings, 'targets' | 'createdAt'>>): void;

  replaceDocument(doc: BudgetDocument, journal?: Fix[]): void;
  undo(): void;
  clearUndo(): void;
}

let repo: BudgetRepository | null = null;

export const useBudget = create<BudgetState>()((set, get) => {
  /** Общая точка записи: новый документ в состояние и в отложенное сохранение. */
  const commit = (doc: BudgetDocument, undoLabel?: string): void => {
    const previous = get().doc;
    set({
      doc,
      undoEntry: undoLabel && previous ? { label: undoLabel, doc: previous, at: Date.now() } : null,
    });
    repo?.scheduleSave(doc);
  };

  const patchDoc = (change: (doc: BudgetDocument) => BudgetDocument, undoLabel?: string): void => {
    const doc = get().doc;
    if (!doc) return;
    commit(change(doc), undoLabel);
  };

  const withFixedItem = (
    doc: BudgetDocument,
    id: string,
    change: (item: FixedItem) => FixedItem,
  ): BudgetDocument => ({
    ...doc,
    fixedItems: doc.fixedItems.map((item) => (item.id === id ? change(item) : item)),
  });

  return {
    status: 'loading',
    doc: null,
    today: todayString(),
    journal: [],
    error: null,
    restoredFrom: null,
    undoEntry: null,

    async init(repository) {
      repo = repository;
      const result = await repository.load();
      if (result.status === 'OK') {
        set({
          status: 'ready',
          doc: result.doc,
          journal: result.journal,
          restoredFrom: result.restoredFrom,
          error: null,
        });
        return;
      }
      if (result.status === 'EMPTY') {
        set({ status: 'onboarding', doc: null, error: null });
        return;
      }
      if (result.status === 'FROM_FUTURE') {
        set({ status: 'error', error: result.message });
        return;
      }
      set({ status: 'error', error: result.message });
    },

    startFresh() {
      const today = get().today;
      const doc = createInitialDocument(monthKeyOf(today), nowIso(), makeId);
      set({ status: 'ready', doc, journal: [], error: null });
      repo?.scheduleSave(doc);
    },

    // ------------------------------------------------------------ операции

    addExpense(input) {
      patchDoc((doc) => {
        const expense: Expense = {
          id: makeId(),
          date: input.date,
          amount: input.amount,
          categoryId: input.categoryId,
          createdAt: nowIso(),
        };
        if (input.flow) expense.flow = input.flow;
        if (input.note) expense.note = input.note;
        return { ...doc, expenses: [...doc.expenses, expense] };
      });
    },

    updateExpense(id, patch) {
      patchDoc((doc) => ({
        ...doc,
        expenses: doc.expenses.map((expense) => {
          if (expense.id !== id) return expense;
          const next: Expense = { ...expense, ...patch };
          // Пустые необязательные поля не хранятся
          if (patch.flow === undefined && 'flow' in patch) delete next.flow;
          if (!next.note) delete next.note;
          return next;
        }),
      }));
    },

    removeExpense(id) {
      patchDoc((doc) => ({ ...doc, expenses: doc.expenses.filter((e) => e.id !== id) }), 'Трата удалена');
    },

    findRecentDuplicate(amount, categoryId) {
      const doc = get().doc;
      if (!doc) return null;
      const now = Date.now();
      for (let i = doc.expenses.length - 1; i >= 0; i--) {
        const expense = doc.expenses[i]!;
        if (expense.amount !== amount || expense.categoryId !== categoryId) continue;
        const at = Date.parse(expense.createdAt);
        if (!Number.isNaN(at) && now - at <= DUPLICATE_WINDOW_MS) return expense;
      }
      return null;
    },

    // ------------------------------------------------- постоянные позиции

    addFixedMonthly(input) {
      patchDoc((doc) => {
        const item: FixedItem = {
          id: makeId(),
          title: input.title,
          kind: input.kind,
          categoryId: input.categoryId,
          mode: 'MONTHLY',
          amounts: [{ fromMonth: input.fromMonth, amount: input.amount }],
        };
        if (input.note) item.note = input.note;
        return { ...doc, fixedItems: [...doc.fixedItems, item] };
      });
    },

    addFixedSpread(input) {
      patchDoc((doc) => {
        const period = {
          fromMonth: input.fromMonth,
          totalAmount: input.totalAmount,
          months: input.months,
          ...(input.payMonth ? { payMonth: input.payMonth } : {}),
          ...(input.payDay ? { payDay: input.payDay } : {}),
        };
        const item: FixedItem = {
          id: makeId(),
          title: input.title,
          kind: 'EXPENSE',
          categoryId: input.categoryId,
          mode: 'SPREAD',
          spreads: [period],
        };
        return { ...doc, fixedItems: [...doc.fixedItems, item] };
      });
    },

    changeFixedAmount(id, fromMonth, amount) {
      patchDoc((doc) =>
        withFixedItem(doc, id, (item) => {
          if (item.mode !== 'MONTHLY') return item;
          const rest = item.amounts.filter((p) => p.fromMonth !== fromMonth);
          const amounts = [...rest, { fromMonth, amount }].sort((a, b) => compareMonth(a.fromMonth, b.fromMonth));
          return { ...item, amounts };
        }),
      );
    },

    correctFixedAmount(id, fromMonth, amount) {
      patchDoc((doc) =>
        withFixedItem(doc, id, (item) => {
          if (item.mode !== 'MONTHLY') return item;
          return {
            ...item,
            amounts: item.amounts.map((p) => (p.fromMonth === fromMonth ? { ...p, amount } : p)),
          };
        }),
      );
    },

    skipFixedMonth(id, month) {
      patchDoc((doc) => ({ ...doc, overrides: upsertOverride(doc.overrides, month, id, null) }), 'Платёж пропущен');
    },

    overrideFixedAmount(id, month, amount) {
      patchDoc((doc) => ({ ...doc, overrides: upsertOverride(doc.overrides, month, id, amount) }));
    },

    endFixedItem(id, month) {
      patchDoc((doc) => {
        const item = doc.fixedItems.find((f) => f.id === id);
        if (!item) return doc;
        // Позиция, не действовавшая ни в одном прошедшем месяце, удаляется
        // полностью — терять нечего (3.3)
        if (!wasActiveBefore(item, month)) {
          return {
            ...doc,
            fixedItems: doc.fixedItems.filter((f) => f.id !== id),
            overrides: doc.overrides.filter((o) => o.fixedItemId !== id),
          };
        }
        // Иначе действует с текущего месяца вперёд: прошлое не переписывается
        return withFixedItem(doc, id, (f) => ({ ...f, endMonth: addMonths(month, -1) }));
      }, 'Платёж отключён');
    },

    eraseFixedItem(id) {
      patchDoc(
        (doc) => ({
          ...doc,
          fixedItems: doc.fixedItems.filter((f) => f.id !== id),
          overrides: doc.overrides.filter((o) => o.fixedItemId !== id),
        }),
        'Позиция стёрта вместе с прошлым',
      );
    },

    // ---------------------------------------------------------- цели

    addGoal(input) {
      patchDoc((doc) => {
        const goal: SavingsGoal = {
          id: makeId(),
          title: input.title,
          targetAmount: input.targetAmount,
          contributions: [],
          archived: false,
          createdAt: nowIso(),
        };
        if (input.deadline) goal.deadline = input.deadline;
        return { ...doc, goals: [...doc.goals, goal] };
      });
    },

    addContribution(goalId, month, amount, note) {
      patchDoc((doc) => ({
        ...doc,
        goals: doc.goals.map((goal) => {
          if (goal.id !== goalId) return goal;
          const contribution: Contribution = { id: makeId(), month, amount };
          if (note) contribution.note = note;
          return { ...goal, contributions: [...goal.contributions, contribution] };
        }),
      }));
    },

    removeContribution(goalId, contributionId) {
      patchDoc(
        (doc) => ({
          ...doc,
          goals: doc.goals.map((goal) =>
            goal.id === goalId
              ? { ...goal, contributions: goal.contributions.filter((c) => c.id !== contributionId) }
              : goal,
          ),
        }),
        'Взнос удалён',
      );
    },

    archiveGoal(goalId) {
      patchDoc(
        (doc) => ({
          ...doc,
          goals: doc.goals.map((goal) => (goal.id === goalId ? { ...goal, archived: true } : goal)),
        }),
        'Цель убрана',
      );
    },

    // ------------------------------------------------------ настройки

    setMonthlyTarget(fromMonth, amount) {
      patchDoc((doc) => {
        const rest = doc.settings.targets.filter((t) => t.fromMonth !== fromMonth);
        const targets = [...rest, { fromMonth, amount }].sort((a, b) => compareMonth(a.fromMonth, b.fromMonth));
        return { ...doc, settings: { ...doc.settings, targets } };
      });
    },

    correctMonthlyTarget(fromMonth, amount) {
      patchDoc((doc) => ({
        ...doc,
        settings: {
          ...doc.settings,
          targets: doc.settings.targets.map((t) => (t.fromMonth === fromMonth ? { ...t, amount } : t)),
        },
      }));
    },

    updateSettings(patch) {
      patchDoc((doc) => ({ ...doc, settings: { ...doc.settings, ...patch } }));
    },

    replaceDocument(doc, journal = []) {
      set({ doc, journal, status: 'ready', error: null, undoEntry: null });
      repo?.scheduleSave(doc);
    },

    // ---------------------------------------------------------- отмена

    undo() {
      const entry = get().undoEntry;
      if (!entry) return;
      set({ doc: entry.doc, undoEntry: null });
      repo?.scheduleSave(entry.doc);
    },

    clearUndo() {
      set({ undoEntry: null });
    },
  };
});

function upsertOverride(
  overrides: MonthOverride[],
  month: MonthKey,
  fixedItemId: string,
  amount: Money | null,
): MonthOverride[] {
  const rest = overrides.filter((o) => !(o.month === month && o.fixedItemId === fixedItemId));
  return [...rest, { month, fixedItemId, amount }];
}

export function currentRepository(): BudgetRepository | null {
  return repo;
}
