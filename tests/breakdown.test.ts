/**
 * Разрез трат месяца: по категориям и по видам.
 */

import { describe, expect, it } from 'vitest';
import { monthSummary, spendingByCategory, spendingByKind } from '../src/engine';
import type { BudgetDocument } from '../src/domain/types';
import { dailyRoutineExpenses, emptyDoc, expense, monthly, R, spread } from './fixtures';

const CAT_SALARY = 'c-salary';
const CAT_FOOD = 'c-food';
const CAT_TECH = 'c-tech';
const CAT_HOME = 'c-home';
const TODAY = '2026-03-16';

function baseDoc(): BudgetDocument {
  const doc = emptyDoc();
  doc.settings.firstMonth = '2026-01';
  doc.fixedItems = [
    monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(120000) }]),
    monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(35000) }]),
    monthly('Связь', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(800) }]),
  ];
  doc.expenses = [
    ...dailyRoutineExpenses('2026-03', 10, R(1000), CAT_FOOD),
    expense('2026-03-05', R(24000), CAT_TECH, 'ONE_OFF'),
    expense('2026-03-20', R(5000), CAT_SALARY),
  ];
  return doc;
}

describe('по категориям', () => {
  const slices = spendingByCategory(baseDoc(), '2026-03');

  it('постоянные и переменные складываются в одну категорию', () => {
    // Аренда 35 000 и связь 800 обе в «Жильё»
    expect(slices.find((s) => s.categoryId === CAT_HOME)!.amount).toBe(R(35800));
    expect(slices.find((s) => s.categoryId === CAT_HOME)!.count).toBe(2);
  });

  it('рутина попадает своей категорией', () => {
    expect(slices.find((s) => s.categoryId === CAT_FOOD)!.amount).toBe(R(10000));
  });

  it('доходы в разрез не входят', () => {
    // Зарплата постоянная и разовый доход 5 000 — оба мимо
    expect(slices.find((s) => s.categoryId === CAT_SALARY)).toBeUndefined();
  });

  it('отсортировано по убыванию', () => {
    const amounts = slices.map((s) => s.amount);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
  });

  it('сумма разреза равна стоимости месяца', () => {
    const total = slices.reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(monthSummary(baseDoc(), '2026-03', TODAY).monthCost);
  });
});

describe('по видам', () => {
  const kinds = spendingByKind(baseDoc(), '2026-03');

  it('порядок постоянный: постоянные, рутина, разовые', () => {
    expect(kinds.map((k) => k.kind)).toEqual(['FIXED', 'ROUTINE', 'ONE_OFF']);
  });

  it('постоянные 35 800', () => expect(kinds[0]!.amount).toBe(R(35800)));
  it('рутина 10 000', () => expect(kinds[1]!.amount).toBe(R(10000)));
  it('разовые 24 000', () => expect(kinds[2]!.amount).toBe(R(24000)));

  it('сумма равна стоимости месяца', () => {
    const total = kinds.reduce((sum, k) => sum + k.amount, 0);
    expect(total).toBe(monthSummary(baseDoc(), '2026-03', TODAY).monthCost);
  });

  it('оба разреза дают одну сумму', () => {
    const byCategory = spendingByCategory(baseDoc(), '2026-03').reduce((s, x) => s + x.amount, 0);
    expect(byCategory).toBe(kinds.reduce((s, k) => s + k.amount, 0));
  });

  it('пустой месяц — нули, но три вида на месте', () => {
    const empty = emptyDoc();
    empty.settings.firstMonth = '2026-01';
    const result = spendingByKind(empty, '2026-03');
    expect(result).toHaveLength(3);
    expect(result.every((k) => k.amount === 0)).toBe(true);
  });
});

describe('доля годового платежа считается как трата месяца', () => {
  it('в разрез идёт доля, а не полная сумма', () => {
    const doc = baseDoc();
    doc.fixedItems.push(
      spread('Страховка', CAT_HOME, [{ fromMonth: '2026-01', totalAmount: R(14400), months: 12 }]),
    );
    const home = spendingByCategory(doc, '2026-03').find((s) => s.categoryId === CAT_HOME)!;
    expect(home.amount).toBe(R(35800) + R(1200));
  });
});
