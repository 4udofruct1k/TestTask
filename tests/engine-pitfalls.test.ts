/**
 * Три места из промпта шага 2, где легко унифицировать то, что унифицировать нельзя.
 */

import { describe, expect, it } from 'vitest';
import { amountAt, oneOffAnalysis, periodSummary, monthSummary, usualDaily } from '../src/engine';
import { daysInMonth } from '../src/domain/dates';
import { dailyRoutineExpenses, emptyDoc, expense, monthly, R, spread } from './fixtures';

const CAT_FOOD = 'c-food';
const CAT_TECH = 'c-tech';
const CAT_HOME = 'c-home';
const CAT_SALARY = 'c-salary';

describe('медиана в usualDaily против среднего в oneOffAnalysis (2.8 и 2.12)', () => {
  /** Пять обычных месяцев по 1 000 ₽ в день и один месяц переезда по 5 000 ₽ в день. */
  function docWithOutlier() {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2025-10';
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];
    doc.expenses = months.flatMap((m) => {
      const perDay = m === '2026-01' ? R(5000) : R(1000);
      return dailyRoutineExpenses(m, daysInMonth(m), perDay, CAT_FOOD);
    });
    return doc;
  }

  it('обычный темп — медиана: месяц переезда планку не поднимает', () => {
    const doc = docWithOutlier();
    // Среднее арифметическое дало бы примерно 1 667 ₽ в день
    expect(usualDaily(doc, '2026-04-15')).toBe(R(1000));
  });

  it('разовые — среднее: дорогой месяц обязан войти в оценку', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2025-10';
    doc.expenses = [expense('2026-03-10', R(60000), CAT_TECH, 'ONE_OFF')];
    // Медиана по ряду [0,0,0,0,0,60 000] дала бы ноль
    expect(oneOffAnalysis(doc, '2026-04', '2026-04-15', 6).avg).toBe(R(10000));
  });
});

describe('остаток от деления в SPREAD уходит в последний месяц цикла', () => {
  const cases = [
    { total: R(14500), months: 12 },
    { total: R(10000), months: 3 },
    { total: 1000, months: 7 },
    { total: R(8400), months: 6 },
    { total: 101, months: 2 },
  ];

  cases.forEach(({ total, months }) => {
    it(`${total} копеек на ${months} месяцев сходится ровно`, () => {
      const item = spread('Платёж', CAT_HOME, [{ fromMonth: '2026-01', totalAmount: total, months }]);
      const base = Math.floor(total / months);
      let sum = 0;
      for (let i = 0; i < months; i++) {
        const value = amountAt(item, `2026-${String(i + 1).padStart(2, '0')}`)!;
        sum += value;
        if (i < months - 1) expect(value).toBe(base);
        else expect(value).toBe(base + (total - base * months));
      }
      expect(sum).toBe(total);
    });
  });

  it('остаток не размазывается по всем месяцам', () => {
    const item = spread('Страховка', CAT_HOME, [
      { fromMonth: '2026-01', totalAmount: R(14500), months: 12 },
    ]);
    const values = Array.from({ length: 12 }, (_, i) =>
      amountAt(item, `2026-${String(i + 1).padStart(2, '0')}`)!,
    );
    expect(new Set(values.slice(0, 11)).size).toBe(1);
    expect(values[11]).toBeGreaterThan(values[0]!);
  });
});

describe('ставка накопления за период — отношение сумм, а не среднее из месячных', () => {
  function twoMonths() {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    doc.fixedItems = [
      monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(100000) }]),
      monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(50000) }]),
    ];
    const salary = doc.fixedItems[0]!;
    const rent = doc.fixedItems[1]!;
    doc.overrides = [
      { month: '2026-02', fixedItemId: salary.id, amount: R(10000) },
      { month: '2026-02', fixedItemId: rent.id, amount: R(30000) },
    ];
    return doc;
  }

  it('месяц с доходом 10 000 и ставкой −200% не утягивает период непропорционально', () => {
    const doc = twoMonths();
    const today = '2026-02-28';
    const january = monthSummary(doc, '2026-01', today);
    const february = monthSummary(doc, '2026-02', today);

    expect(january.savingsRate).toBeCloseTo(0.5, 6);
    expect(february.savingsRate).toBeCloseTo(-2, 6);

    const period = periodSummary(doc, ['2026-01', '2026-02'], today);
    // Σ net 30 000 / Σ totalIncome 110 000
    expect(period.net).toBe(R(30000));
    expect(period.totalIncome).toBe(R(110000));
    expect(period.savingsRate).toBeCloseTo(0.272727, 6);

    // Среднее из месячных ставок дало бы −0,75 — это и есть неверный ответ
    const naive = (january.savingsRate! + february.savingsRate!) / 2;
    expect(naive).toBeCloseTo(-0.75, 6);
    expect(period.savingsRate).not.toBeCloseTo(naive, 2);
  });

  it('незавершённый месяц входит по факту и помечается неполным', () => {
    const doc = twoMonths();
    const period = periodSummary(doc, ['2026-01', '2026-02'], '2026-02-10');
    expect(period.incomplete).toBe(true);
    const closed = periodSummary(doc, ['2026-01'], '2026-02-10');
    expect(closed.incomplete).toBe(false);
  });

  it('при нулевом доходе периода ставка не считается', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    expect(periodSummary(doc, ['2026-01'], '2026-01-15').savingsRate).toBeNull();
  });
});
