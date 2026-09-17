/**
 * Удержание налога с постоянного дохода.
 *
 * Вычет — необязательная настройка позиции: поля нет, значит ничего
 * не удерживается и все расчёты идут как раньше.
 */

import { describe, expect, it } from 'vitest';
import {
  amountAt,
  fixedBlock,
  grossAmountAt,
  monthSummary,
  resolveFixed,
  taxOn,
} from '../src/engine';
import { validateDocument } from '../src/domain/validate';
import { migrate } from '../src/storage';
import { CURRENT_SCHEMA_VERSION } from '../src/domain/types';
import type { BudgetDocument, FixedItem } from '../src/domain/types';
import { dailyRoutineExpenses, emptyDoc, monthly, R } from './fixtures';

const CAT_SALARY = 'c-salary';
const CAT_FOOD = 'c-food';
const CAT_HOME = 'c-home';

/** Условия К1 плюс переменные траты на 28 400. */
function baseDoc(taxPercent?: number): BudgetDocument {
  const doc = emptyDoc();
  doc.settings.firstMonth = '2026-01';
  const salary = monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(120000) }]);
  if (taxPercent !== undefined) salary.taxPercent = taxPercent;
  doc.fixedItems = [
    salary,
    monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(35000) }]),
    monthly('Связь', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(800) }]),
    monthly('Подписки', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(1200) }]),
  ];
  doc.expenses = dailyRoutineExpenses('2026-03', 16, R(1775), CAT_FOOD);
  return doc;
}

describe('без вычета всё считается как раньше', () => {
  const summary = monthSummary(baseDoc(), '2026-03', '2026-03-16');

  it('fixedIncome 120 000 — К1 не сдвинулся', () => expect(summary.fixedIncome).toBe(R(120000)));
  it('free 83 000', () => expect(summary.free).toBe(R(83000)));
  it('net 54 600', () => expect(summary.net).toBe(R(54600)));
  it('удержаний нет', () => {
    expect(fixedBlock(baseDoc(), '2026-03').taxWithheld).toBe(0);
    expect(resolveFixed(baseDoc(), '2026-03')[0]!.tax).toBe(0);
  });
  it('начислено и к выплате совпадают', () => {
    const item = resolveFixed(baseDoc(), '2026-03')[0]!;
    expect(item.gross).toBe(item.amount);
  });
});

describe('вычет 13% с зарплаты', () => {
  const doc = baseDoc(13);
  const summary = monthSummary(doc, '2026-03', '2026-03-16');
  const block = fixedBlock(doc, '2026-03');

  it('начислено 120 000, удержано 15 600', () => {
    expect(block.fixedIncomeGross).toBe(R(120000));
    expect(block.taxWithheld).toBe(R(15600));
  });

  it('в расчёты идёт то, что остаётся: 104 400', () => {
    expect(block.fixedIncome).toBe(R(104400));
    expect(summary.fixedIncome).toBe(R(104400));
  });

  it('free 104 400 − 37 000 = 67 400', () => expect(summary.free).toBe(R(67400)));
  it('net 67 400 − 28 400 = 39 000', () => expect(summary.net).toBe(R(39000)));
  it('ставка накопления считается от пришедших денег', () =>
    expect(summary.savingsRate).toBeCloseTo(R(39000) / R(104400), 9));

  it('amountAt отдаёт сумму после удержания, grossAmountAt — до', () => {
    const salary = doc.fixedItems[0]!;
    expect(grossAmountAt(salary, '2026-03')).toBe(R(120000));
    expect(amountAt(salary, '2026-03')).toBe(R(104400));
  });

  it('позиция расхода вычетом не затрагивается', () => {
    const rent = doc.fixedItems[1]!;
    expect(amountAt(rent, '2026-03')).toBe(R(35000));
    expect(taxOn(rent, R(35000))).toBe(0);
  });
});

describe('вычет и прочие правила домена', () => {
  it('оверрайд задаёт начисленную сумму, налог считается от неё', () => {
    const doc = baseDoc(13);
    const salary = doc.fixedItems[0]!;
    doc.overrides = [{ month: '2026-03', fixedItemId: salary.id, amount: R(90000) }];
    const item = resolveFixed(doc, '2026-03')[0]!;
    expect(item.gross).toBe(R(90000));
    expect(item.tax).toBe(R(11700));
    expect(item.amount).toBe(R(78300));
  });

  it('пропуск месяца убирает и доход, и удержание', () => {
    const doc = baseDoc(13);
    const salary = doc.fixedItems[0]!;
    doc.overrides = [{ month: '2026-03', fixedItemId: salary.id, amount: null }];
    const block = fixedBlock(doc, '2026-03');
    expect(block.fixedIncome).toBe(0);
    expect(block.taxWithheld).toBe(0);
  });

  it('результат удержания — целые копейки', () => {
    const doc = baseDoc(13);
    const salary = doc.fixedItems[0]!;
    // 13% от 1 001 копейки — 130,13, округляется до целого
    expect(taxOn(salary, 1001)).toBe(130);
    expect(Number.isInteger(taxOn(salary, 3333))).toBe(true);
  });

  it('прошлое не переписывается: вычет применяется к сумме своего периода', () => {
    const doc = baseDoc(13);
    const salary = doc.fixedItems[0]! as Extract<FixedItem, { mode: 'MONTHLY' }>;
    salary.amounts.push({ fromMonth: '2026-06', amount: R(140000) });
    expect(amountAt(salary, '2026-05')).toBe(R(104400));
    expect(amountAt(salary, '2026-06')).toBe(R(121800));
  });
});

describe('валидатор', () => {
  it('ставка вне 1..99 убирается, вычет выключается', () => {
    const doc = baseDoc(0);
    const result = validateDocument(doc);
    expect(result.fatal).toEqual([]);
    expect(result.fixed.map((f) => f.code)).toContain('DROPPED_TAX_PERCENT');
    expect(result.doc!.fixedItems[0]!.taxPercent).toBeUndefined();
  });

  it('дробная ставка убирается', () => {
    const doc = baseDoc(13.5);
    const result = validateDocument(doc);
    expect(result.doc!.fixedItems[0]!.taxPercent).toBeUndefined();
  });

  it('с расхода налог не удерживают — поле убирается', () => {
    const doc = baseDoc();
    doc.fixedItems[1]!.taxPercent = 13;
    const result = validateDocument(doc);
    expect(result.fixed.map((f) => f.code)).toContain('DROPPED_TAX_PERCENT');
    expect(result.doc!.fixedItems[1]!.taxPercent).toBeUndefined();
  });

  it('корректная ставка проходит без замечаний', () => {
    const result = validateDocument(baseDoc(13));
    expect(result.fatal).toEqual([]);
    expect(result.fixed).toEqual([]);
    expect(result.doc!.fixedItems[0]!.taxPercent).toBe(13);
  });
});

describe('миграция 3→4', () => {
  it('документ версии 3 открывается, суммы не меняются', () => {
    const before = baseDoc();
    const v3 = { ...before, schemaVersion: 3 };
    const expected = monthSummary(before, '2026-03', '2026-03-16');

    const result = migrate(v3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toEqual([4]);
    expect(result.doc['schemaVersion']).toBe(CURRENT_SCHEMA_VERSION);

    const validated = validateDocument(result.doc);
    expect(validated.fatal).toEqual([]);
    const after = monthSummary(validated.doc!, '2026-03', '2026-03-16');
    expect(after.fixedIncome).toBe(expected.fixedIncome);
    expect(after.free).toBe(expected.free);
    expect(after.net).toBe(expected.net);
  });

  it('в файле версии 3 вычета не было — после миграции его тоже нет', () => {
    const result = migrate({ ...baseDoc(), schemaVersion: 3 });
    if (!result.ok) throw new Error('миграция не прошла');
    const items = result.doc['fixedItems'] as Record<string, unknown>[];
    expect(items.every((i) => i['taxPercent'] === undefined)).toBe(true);
  });
});
