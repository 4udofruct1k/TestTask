/**
 * Расписание постоянных: что уже случилось, что ещё впереди (2.14).
 *
 * Числа на суммы месяца не влияют — это проверяется отдельно: иначе
 * «единица учёта — месяц» перестанет быть правдой при первом же дне.
 */

import { describe, expect, it } from 'vitest';
import { fixedProgress, monthSchedule, monthSummary } from '../src/engine';
import type { BudgetDocument, FixedItemMonthly } from '../src/domain/types';
import { emptyDoc, monthly, R } from './fixtures';

const CAT_SALARY = 'c-salary';
const CAT_HOME = 'c-home';

/** Зарплата двумя частями: остаток 5-го, аванс 20-го. Аренда 10-го. */
function baseDoc(): BudgetDocument {
  const doc = emptyDoc();
  doc.settings.firstMonth = '2026-01';
  const rest = monthly('Зарплата, остаток', 'INCOME', CAT_SALARY, [
    { fromMonth: '2026-01', amount: R(60000) },
  ]) as FixedItemMonthly;
  const advance = monthly('Зарплата, аванс', 'INCOME', CAT_SALARY, [
    { fromMonth: '2026-01', amount: R(60000) },
  ]) as FixedItemMonthly;
  const rent = monthly('Аренда', 'EXPENSE', CAT_HOME, [
    { fromMonth: '2026-01', amount: R(35000) },
  ]) as FixedItemMonthly;
  rest.dueDay = 5;
  advance.dueDay = 20;
  rent.dueDay = 10;
  doc.fixedItems = [rest, advance, rent];
  return doc;
}

describe('события месяца', () => {
  it('идут по возрастанию числа', () => {
    expect(monthSchedule(baseDoc(), '2026-10', '2026-10-01').map((e) => e.day)).toEqual([5, 10, 20]);
  });

  it('первого числа не случилось ещё ничего', () => {
    const progress = fixedProgress(baseDoc(), '2026-10', '2026-10-01');
    expect(progress.income.done).toBe(0);
    expect(progress.income.ahead).toBe(R(120000));
    expect(progress.expense.done).toBe(0);
    expect(progress.next!.title).toBe('Зарплата, остаток');
  });

  it('в день выплаты она уже пришла', () => {
    const progress = fixedProgress(baseDoc(), '2026-10', '2026-10-05');
    expect(progress.income.done).toBe(R(60000));
    expect(progress.income.ahead).toBe(R(60000));
    expect(progress.next!.day).toBe(10);
  });

  it('к концу месяца случилось всё', () => {
    const progress = fixedProgress(baseDoc(), '2026-10', '2026-10-31');
    expect(progress.income.done).toBe(R(120000));
    expect(progress.expense.done).toBe(R(35000));
    expect(progress.next).toBeNull();
  });

  it('закрытый месяц случился целиком', () => {
    const progress = fixedProgress(baseDoc(), '2026-09', '2026-10-01');
    expect(progress.income.done).toBe(progress.income.total);
    expect(progress.income.ahead).toBe(0);
  });

  it('будущий месяц не случился вовсе', () => {
    const progress = fixedProgress(baseDoc(), '2026-11', '2026-10-15');
    expect(progress.income.done).toBe(0);
    expect(progress.income.ahead).toBe(progress.income.total);
  });
});

describe('числа не трогают суммы месяца', () => {
  it('итог месяца тот же, что без чисел', () => {
    const withDays = monthSummary(baseDoc(), '2026-10', '2026-10-01');
    const doc = baseDoc();
    for (const item of doc.fixedItems) delete (item as FixedItemMonthly).dueDay;
    const without = monthSummary(doc, '2026-10', '2026-10-01');
    expect(withDays.totalIncome).toBe(without.totalIncome);
    expect(withDays.fixedExpense).toBe(without.fixedExpense);
    expect(withDays.net).toBe(without.net);
  });

  it('пришедшее и предстоящее в сумме дают весь постоянный доход', () => {
    const progress = fixedProgress(baseDoc(), '2026-10', '2026-10-12');
    expect(progress.income.done + progress.income.ahead + progress.income.undated).toBe(
      progress.income.total,
    );
  });
});

describe('края', () => {
  it('31-е число в коротком месяце становится последним днём', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    const item = monthly('Аренда', 'EXPENSE', CAT_HOME, [
      { fromMonth: '2026-01', amount: R(1000) },
    ]) as FixedItemMonthly;
    item.dueDay = 31;
    doc.fixedItems = [item];
    expect(monthSchedule(doc, '2026-04', '2026-04-15')[0]!.date).toBe('2026-04-30');
    expect(monthSchedule(doc, '2026-05', '2026-05-15')[0]!.date).toBe('2026-05-31');
  });

  it('позиция без числа в расписание не попадает, но в итог входит', () => {
    const doc = baseDoc();
    doc.fixedItems.push(
      monthly('Связь', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(800) }]),
    );
    const progress = fixedProgress(doc, '2026-10', '2026-10-01');
    expect(progress.events).toHaveLength(3);
    expect(progress.expense.undated).toBe(R(800));
    expect(progress.expense.total).toBe(R(35800));
  });

  it('без единого числа расписания нет', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    doc.fixedItems = [monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(1000) }])];
    expect(fixedProgress(doc, '2026-10', '2026-10-01').hasDays).toBe(false);
  });
});
