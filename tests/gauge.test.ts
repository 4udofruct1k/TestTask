/**
 * Шкала блока бюджета: сколько осталось из всего дохода и каким цветом.
 */

import { describe, expect, it } from 'vitest';
import { budgetGauge, monthSummary, NEAR_TARGET_MARGIN } from '../src/engine';
import type { BudgetDocument } from '../src/domain/types';
import { dailyRoutineExpenses, emptyDoc, expense, goal, monthly, R } from './fixtures';

const CAT_SALARY = 'c-salary';
const CAT_FOOD = 'c-food';
const CAT_TECH = 'c-tech';
const CAT_HOME = 'c-home';

/** Условия К1: доход 120 000, постоянные 37 000, рутина 28 400. */
function baseDoc(target?: number): BudgetDocument {
  const doc = emptyDoc();
  doc.settings.firstMonth = '2026-01';
  if (target !== undefined) doc.settings.targets = [{ fromMonth: '2026-01', amount: target }];
  doc.fixedItems = [
    monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(120000) }]),
    monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(35000) }]),
    monthly('Связь', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(800) }]),
    monthly('Подписки', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(1200) }]),
  ];
  doc.expenses = dailyRoutineExpenses('2026-03', 16, R(1775), CAT_FOOD);
  return doc;
}

const TODAY = '2026-03-16';

describe('величины шкалы', () => {
  const gauge = budgetGauge(baseDoc(), '2026-03', TODAY);

  it('полная шкала — весь доход месяца', () => expect(gauge.total).toBe(R(120000)));
  it('потрачено — постоянные плюс переменные', () => expect(gauge.spent).toBe(R(65400)));
  it('осталось 54 600', () => expect(gauge.left).toBe(R(54600)));

  it('осталось это в точности накопление месяца', () => {
    expect(gauge.left).toBe(monthSummary(baseDoc(), '2026-03', TODAY).net);
  });

  it('потрачено и осталось в сумме дают весь доход', () => {
    expect(gauge.spent + gauge.left).toBe(gauge.total);
  });

  it('заполнение — доля неистраченного, она же ставка накопления', () => {
    expect(gauge.fill).toBeCloseTo(0.455, 6);
    expect(gauge.fill).toBeCloseTo(monthSummary(baseDoc(), '2026-03', TODAY).savingsRate!, 9);
  });
});

describe('цвет шкалы', () => {
  it('без цели зелёная, пока не ушли в минус', () => {
    expect(budgetGauge(baseDoc(), '2026-03', TODAY).state).toBe('SAFE');
  });

  it('без цели красная при перерасходе', () => {
    const doc = baseDoc();
    doc.expenses.push(expense('2026-03-10', R(90000), CAT_TECH, 'ONE_OFF'));
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.left).toBeLessThan(0);
    expect(gauge.state).toBe('SHORT');
    // Ниже нуля шкала не опускается
    expect(gauge.fill).toBe(0);
  });

  it('осталось заметно больше цели — зелёная', () => {
    expect(budgetGauge(baseDoc(R(30000)), '2026-03', TODAY).state).toBe('SAFE');
  });

  it('осталось подошло к цели вплотную — оранжевая', () => {
    // 54 600 против цели 50 000: запас 9,2%, меньше порога в 15%
    expect(budgetGauge(baseDoc(R(50000)), '2026-03', TODAY).state).toBe('NEAR');
  });

  it('осталось меньше цели — красная', () => {
    expect(budgetGauge(baseDoc(R(60000)), '2026-03', TODAY).state).toBe('SHORT');
  });

  it('граница между зелёной и оранжевой ровно на пороге', () => {
    const left = R(54600);
    const justSafe = Math.floor(left / (1 + NEAR_TARGET_MARGIN)) - 1;
    const justNear = Math.floor(left / (1 + NEAR_TARGET_MARGIN)) + 1;
    expect(budgetGauge(baseDoc(justSafe), '2026-03', TODAY).state).toBe('SAFE');
    expect(budgetGauge(baseDoc(justNear), '2026-03', TODAY).state).toBe('NEAR');
  });

  it('граница между оранжевой и красной — ровно цель', () => {
    const left = R(54600);
    expect(budgetGauge(baseDoc(left), '2026-03', TODAY).state).toBe('NEAR');
    expect(budgetGauge(baseDoc(left + 1), '2026-03', TODAY).state).toBe('SHORT');
  });
});

describe('граничные случаи', () => {
  it('без дохода шкала пустая', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.total).toBe(0);
    expect(gauge.fill).toBe(0);
    expect(gauge.state).toBe('SAFE');
  });

  it('ничего не потрачено — шкала полная', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    doc.fixedItems = [
      monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(120000) }]),
    ];
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.fill).toBe(1);
    expect(gauge.left).toBe(R(120000));
  });

  it('удержание налога уменьшает и шкалу, и остаток', () => {
    const doc = baseDoc();
    doc.fixedItems[0]!.taxPercent = 13;
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.total).toBe(R(104400));
    expect(gauge.left).toBe(R(39000));
  });
});

describe('риска цели на шкале', () => {
  it('стоит там, где цель относится ко всему доходу', () => {
    const gauge = budgetGauge(baseDoc(R(30000)), '2026-03', TODAY);
    expect(gauge.targetMark).toBeCloseTo(30000 / 120000, 9);
  });

  it('без цели риски нет', () => {
    expect(budgetGauge(baseDoc(), '2026-03', TODAY).targetMark).toBeNull();
  });

  it('цель больше дохода — риска упирается в край', () => {
    expect(budgetGauge(baseDoc(R(200000)), '2026-03', TODAY).targetMark).toBe(1);
  });

  it('без дохода риски нет: шкалы тоже нет', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    doc.settings.targets = [{ fromMonth: '2026-01', amount: R(30000) }];
    expect(budgetGauge(doc, '2026-03', TODAY).targetMark).toBeNull();
  });

  it('заполнение выше риски ровно тогда, когда шкала не красная', () => {
    for (const target of [R(10000), R(30000), R(50000), R(54600), R(70000)]) {
      const gauge = budgetGauge(baseDoc(target), '2026-03', TODAY);
      const above = gauge.fill >= gauge.targetMark!;
      expect(above).toBe(gauge.state !== 'SHORT');
    }
  });
});

/**
 * Нулевая цель — законный ответ «в этом месяце не откладываю» (1.6).
 * От «цель не задана» она отличается тем, что сказана вслух: запись есть,
 * версионность работает, прошлые месяцы сохраняют свою цель.
 */
describe('нулевая цель', () => {
  it('сохраняется как цель, а не как её отсутствие', () => {
    const doc = baseDoc(0);
    expect(budgetGauge(doc, '2026-03', TODAY).target).toBe(0);
  });

  it('риски на шкале не рисует', () => {
    expect(budgetGauge(baseDoc(0), '2026-03', TODAY).targetMark).toBeNull();
  });

  it('шкала зелёная, пока не ушли в минус', () => {
    expect(budgetGauge(baseDoc(0), '2026-03', TODAY).state).toBe('SAFE');
  });

  it('шкала красная при перерасходе — как и без цели', () => {
    const doc = baseDoc(0);
    doc.expenses.push(expense('2026-03-10', R(90000), CAT_TECH, 'ONE_OFF'));
    expect(budgetGauge(doc, '2026-03', TODAY).state).toBe('SHORT');
  });

  it('прошлые месяцы сохраняют прежнюю цель', () => {
    const doc = baseDoc(R(30000));
    doc.settings.targets.push({ fromMonth: '2026-03', amount: 0 });
    expect(budgetGauge(doc, '2026-02', TODAY).target).toBe(R(30000));
    expect(budgetGauge(doc, '2026-03', TODAY).target).toBe(0);
  });
});

/**
 * «Осталось» — свободные деньги: не потраченные и никуда не отложенные.
 * Взнос в копилку не трата (1.7), но и свободными эти деньги уже не назвать.
 * Условия К1: net месяца 54 600.
 */
describe('копилки', () => {
  function withContribution(amount: number, target?: number): BudgetDocument {
    const doc = baseDoc(target);
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-03', amount }])];
    return doc;
  }

  it('отложенное в копилку вычитается из «Осталось»', () => {
    const gauge = budgetGauge(withContribution(R(10000)), '2026-03', TODAY);
    expect(gauge.net).toBe(R(54600));
    expect(gauge.earmarked).toBe(R(10000));
    expect(gauge.left).toBe(R(44600));
  });

  it('потрачено, отложено и осталось в сумме дают весь доход', () => {
    const gauge = budgetGauge(withContribution(R(10000)), '2026-03', TODAY);
    expect(gauge.spent + gauge.earmarkedFromMonth + gauge.left).toBe(gauge.total);
  });

  it('взносы других месяцев «Осталось» этого месяца не трогают', () => {
    const doc = baseDoc();
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-02', amount: R(10000) }])];
    expect(budgetGauge(doc, '2026-03', TODAY).left).toBe(R(54600));
  });

  it('отложили больше остатка — излишек из прошлых накоплений, в минус месяц не уходит', () => {
    const gauge = budgetGauge(withContribution(R(80000)), '2026-03', TODAY);
    expect(gauge.earmarked).toBe(R(80000));
    expect(gauge.earmarkedFromMonth).toBe(R(54600));
    expect(gauge.left).toBe(0);
  });

  it('при перерасходе взнос остатка не уменьшает: его там нет', () => {
    const doc = withContribution(R(5000));
    doc.expenses.push(expense('2026-03-10', R(90000), CAT_TECH, 'ONE_OFF'));
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.earmarkedFromMonth).toBe(0);
    expect(gauge.left).toBe(gauge.net);
  });

  it('взнос в копилку не красит шкалу: отложить — это и есть накопить', () => {
    // net 54 600 против цели 50 000 — оранжевый с копилкой и без неё одинаково
    const without = budgetGauge(baseDoc(R(50000)), '2026-03', TODAY).state;
    const withJar = budgetGauge(withContribution(R(30000), R(50000)), '2026-03', TODAY).state;
    expect(withJar).toBe(without);
  });

  it('риска сдвигается на отложенное: заливка выше неё ровно тогда, когда шкала не красная', () => {
    for (const target of [R(10000), R(30000), R(50000), R(54600), R(70000)]) {
      const gauge = budgetGauge(withContribution(R(20000), target), '2026-03', TODAY);
      if (gauge.targetMark === null) {
        // Цель целиком закрыта копилками — значит и net её покрывает
        expect(gauge.state).not.toBe('SHORT');
        continue;
      }
      expect(gauge.fill >= gauge.targetMark).toBe(gauge.state !== 'SHORT');
    }
  });

  it('цель, целиком закрытая копилками, риски не рисует', () => {
    expect(budgetGauge(withContribution(R(30000), R(30000)), '2026-03', TODAY).targetMark).toBeNull();
  });

  it('взносы закрытой копилки остаются в истории месяца', () => {
    const doc = withContribution(R(10000));
    doc.goals[0]!.archived = true;
    expect(budgetGauge(doc, '2026-03', TODAY).left).toBe(R(44600));
  });
});
