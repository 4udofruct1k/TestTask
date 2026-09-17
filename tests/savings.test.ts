/**
 * Накопления: остаток месяца переносится в кучу, бюджет следующего
 * считается заново от его собственного дохода.
 */

import { describe, expect, it } from 'vitest';
import { monthSummary, savingsLedger } from '../src/engine';
import type { BudgetDocument } from '../src/domain/types';
import { dailyRoutineExpenses, emptyDoc, goal, monthly, R } from './fixtures';

const CAT_SALARY = 'c-salary';
const CAT_FOOD = 'c-food';
const CAT_HOME = 'c-home';

/** Зарплата 120 000 и аренда 35 000 с января, рутина только в марте. */
function baseDoc(startingBalance = 0): BudgetDocument {
  const doc = emptyDoc();
  doc.settings.firstMonth = '2026-01';
  doc.settings.startingBalance = startingBalance;
  doc.fixedItems = [
    monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(120000) }]),
    monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(35000) }]),
  ];
  doc.expenses = dailyRoutineExpenses('2026-03', 16, R(1775), CAT_FOOD);
  return doc;
}

const TODAY = '2026-03-16';

describe('куча складывается из стартовой суммы и остатков месяцев', () => {
  const ledger = savingsLedger(baseDoc(R(215000)), TODAY);

  it('стартовая сумма учтена', () => expect(ledger.startingBalance).toBe(R(215000)));

  it('закрытые месяцы — январь и февраль по 85 000', () => {
    expect(ledger.closed).toBe(R(170000));
  });

  it('текущий месяц идёт по факту на сегодня', () => {
    expect(ledger.current).toBe(monthSummary(baseDoc(), '2026-03', TODAY).net);
    expect(ledger.current).toBe(R(56600));
  });

  it('всего — сумма всех трёх частей', () => {
    expect(ledger.total).toBe(R(215000) + R(170000) + R(56600));
  });

  it('без стартовой суммы куча меньше ровно на неё', () => {
    expect(savingsLedger(baseDoc(), TODAY).total).toBe(ledger.total - R(215000));
  });
});

describe('остаток месяца переносится, бюджет следующего начинается заново', () => {
  const ledger = savingsLedger(baseDoc(), TODAY);

  it('каждый месяц вкладывает в кучу свой остаток', () => {
    const january = ledger.months.find((m) => m.month === '2026-01')!;
    expect(january.net).toBe(monthSummary(baseDoc(), '2026-01', TODAY).net);
  });

  it('нарастающий итог растёт от месяца к месяцу', () => {
    const byMonth = [...ledger.months].reverse();
    let expected = 0;
    for (const entry of byMonth) {
      expected += entry.net;
      expect(entry.running).toBe(expected);
    }
  });

  it('бюджет февраля не зависит от того, сколько осталось в январе', () => {
    const rich = baseDoc();
    const poor = baseDoc();
    // В январе потрачено почти всё, в феврале это ничего не меняет
    poor.expenses.push(...dailyRoutineExpenses('2026-01', 20, R(4000), CAT_FOOD));
    expect(monthSummary(poor, '2026-01', TODAY).net).toBeLessThan(
      monthSummary(rich, '2026-01', TODAY).net,
    );
    expect(monthSummary(poor, '2026-02', TODAY).net).toBe(monthSummary(rich, '2026-02', TODAY).net);
  });

  it('но в куче разница видна', () => {
    const poor = baseDoc();
    poor.expenses.push(...dailyRoutineExpenses('2026-01', 20, R(4000), CAT_FOOD));
    expect(savingsLedger(poor, TODAY).total).toBeLessThan(savingsLedger(baseDoc(), TODAY).total);
  });

  it('история идёт от новых месяцев к старым', () => {
    expect(ledger.months.map((m) => m.month)).toEqual(['2026-03', '2026-02', '2026-01']);
  });

  it('текущий месяц помечен как незакрытый', () => {
    expect(ledger.months[0]!.current).toBe(true);
    expect(ledger.months[1]!.current).toBe(false);
  });
});

describe('взносы метят деньги, а не вынимают их', () => {
  it('помеченное — часть кучи, свободное это остальное', () => {
    const doc = baseDoc(R(215000));
    doc.goals = [goal('Новый ПК', R(300000), [{ month: '2026-02', amount: R(80000) }])];
    const ledger = savingsLedger(doc, TODAY);

    expect(ledger.earmarked).toBe(R(80000));
    expect(ledger.free).toBe(ledger.total - R(80000));
    // Взнос не уменьшил ни один месяц: он не трата (1.7)
    expect(ledger.total).toBe(savingsLedger(baseDoc(R(215000)), TODAY).total);
  });

  it('архивированная цель метку снимает', () => {
    const doc = baseDoc();
    doc.goals = [goal('Новый ПК', R(300000), [{ month: '2026-02', amount: R(80000) }])];
    doc.goals[0]!.archived = true;
    const ledger = savingsLedger(doc, TODAY);
    expect(ledger.earmarked).toBe(0);
    expect(ledger.free).toBe(ledger.total);
  });

  it('пометить можно больше, чем есть — свободное уходит в минус', () => {
    const doc = baseDoc();
    doc.goals = [goal('Мечта', R(9000000), [{ month: '2026-02', amount: R(900000) }])];
    const ledger = savingsLedger(doc, TODAY);
    expect(ledger.free).toBeLessThan(0);
  });
});

describe('граничные случаи', () => {
  it('пустой документ — пустая куча', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-03';
    const ledger = savingsLedger(doc, TODAY);
    expect(ledger.total).toBe(0);
    expect(ledger.months).toHaveLength(1);
  });

  it('первый месяц учёта в будущем — истории нет', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-09';
    doc.settings.startingBalance = R(50000);
    const ledger = savingsLedger(doc, TODAY);
    expect(ledger.months).toEqual([]);
    expect(ledger.total).toBe(R(50000));
  });

  it('перерасход уменьшает кучу', () => {
    const doc = baseDoc(R(10000));
    doc.expenses.push(...dailyRoutineExpenses('2026-02', 28, R(10000), CAT_FOOD));
    const ledger = savingsLedger(doc, TODAY);
    expect(monthSummary(doc, '2026-02', TODAY).net).toBeLessThan(0);
    expect(ledger.total).toBeLessThan(savingsLedger(baseDoc(R(10000)), TODAY).total);
  });
});
