/**
 * Блок бюджета: сколько свободных денег сейчас и каким цветом (3.2).
 *
 * «Осталось» — деньги, которые есть на самом деле: свободное к началу
 * месяца, плюс пришедшее, минус ушедшее и отложенное в копилки.
 * Цвет — от плана месяца: первого числа месяц не провален только потому,
 * что зарплата ещё не пришла.
 */

import { describe, expect, it } from 'vitest';
import { budgetGauge, NEAR_TARGET_MARGIN, savingsLedger } from '../src/engine';
import type { BudgetDocument, FixedItemMonthly } from '../src/domain/types';
import { dailyRoutineExpenses, emptyDoc, expense, goal, monthly, R } from './fixtures';

const CAT_SALARY = 'c-salary';
const CAT_FOOD = 'c-food';
const CAT_TECH = 'c-tech';
const CAT_HOME = 'c-home';

const TODAY = '2026-03-16';

/**
 * Условия К1, учёт начат в марте: доход 120 000, постоянные 37 000,
 * рутина 16 дней по 1 775. Чисел у позиций нет — случились с первого.
 * План месяца и факт на сегодня здесь совпадают: 54 600.
 */
function baseDoc(target?: number): BudgetDocument {
  const doc = emptyDoc();
  doc.settings.firstMonth = '2026-03';
  if (target !== undefined) doc.settings.targets = [{ fromMonth: '2026-03', amount: target }];
  doc.fixedItems = [
    monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(120000) }]),
    monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(35000) }]),
    monthly('Связь', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(800) }]),
    monthly('Подписки', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(1200) }]),
  ];
  doc.expenses = dailyRoutineExpenses('2026-03', 16, R(1775), CAT_FOOD);
  return doc;
}

/** Зарплата двумя частями с числами, как у пользователя: 5-го и 20-го. */
function splitSalary(doc: BudgetDocument, first = 5, second = 20): BudgetDocument {
  const half = R(60000);
  const rest = monthly('Зарплата, остаток', 'INCOME', CAT_SALARY, [
    { fromMonth: '2026-01', amount: half },
  ]) as FixedItemMonthly;
  const advance = monthly('Зарплата, аванс', 'INCOME', CAT_SALARY, [
    { fromMonth: '2026-01', amount: half },
  ]) as FixedItemMonthly;
  rest.dueDay = first;
  advance.dueDay = second;
  doc.fixedItems = [rest, advance, ...doc.fixedItems.filter((f) => f.kind !== 'INCOME')];
  return doc;
}

describe('величины блока', () => {
  const gauge = budgetGauge(baseDoc(), '2026-03', TODAY);

  it('доход месяца — 120 000', () => expect(gauge.total).toBe(R(120000)));
  it('потрачено по сегодня — постоянные плюс траты', () => expect(gauge.spent).toBe(R(65400)));
  it('осталось 54 600', () => expect(gauge.left).toBe(R(54600)));
  it('ничего не ждём', () => expect(gauge.pending).toBe(0));
});

describe('осталось — это деньги, которые есть', () => {
  it('стартовая сумма входит в «Осталось»', () => {
    const doc = baseDoc();
    doc.settings.startingBalance = R(50000);
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.carried).toBe(R(50000));
    expect(gauge.left).toBe(R(104600));
  });

  it('зарплата с числом впереди ещё не пришла', () => {
    const gauge = budgetGauge(splitSalary(baseDoc()), '2026-03', TODAY);
    // 16 марта: остаток 5-го пришёл, аванс 20-го — нет
    expect(gauge.received).toBe(R(60000));
    expect(gauge.pending).toBe(R(60000));
    expect(gauge.nextIncomeDate).toBe('2026-03-20');
    expect(gauge.left).toBe(R(60000) - R(65400));
  });

  it('случай из жизни: первое число, зарплата 5-го и 20-го, свободно только стартовое', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-10';
    doc.settings.startingBalance = R(40000);
    splitSalary(doc);
    const gauge = budgetGauge(doc, '2026-10', '2026-10-01');
    expect(gauge.left).toBe(R(40000));
    expect(gauge.pending).toBe(R(120000));
    expect(gauge.spent).toBe(0);
  });

  it('трата с будущей датой ещё не потрачена', () => {
    const doc = baseDoc();
    doc.expenses.push(expense('2026-03-25', R(10000), CAT_TECH, 'ONE_OFF'));
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.left).toBe(R(54600));
    // А в плане месяца она уже есть
    expect(gauge.net).toBe(R(44600));
  });

  it('остатки прошлых месяцев лежат в «Осталось»', () => {
    const doc = baseDoc();
    doc.settings.firstMonth = '2026-01';
    // Январь и февраль без трат: по 120 000 − 37 000 = 83 000
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.carried).toBe(R(166000));
    expect(gauge.left).toBe(R(166000) + R(54600));
  });

  it('то же число, что «свободно» на экране накоплений', () => {
    const doc = splitSalary(baseDoc());
    doc.settings.firstMonth = '2026-01';
    doc.settings.startingBalance = R(25000);
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-02', amount: R(7000) }, { month: '2026-03', amount: R(3000) }])];
    expect(budgetGauge(doc, '2026-03', TODAY).left).toBe(savingsLedger(doc, TODAY).free);
  });

  it('удержание налога уменьшает и доход, и остаток', () => {
    const doc = baseDoc();
    doc.fixedItems[0]!.taxPercent = 13;
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.total).toBe(R(104400));
    expect(gauge.left).toBe(R(39000));
  });
});

describe('копилки', () => {
  it('отложенное в этом месяце вычитается из «Осталось»', () => {
    const doc = baseDoc();
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-03', amount: R(10000) }])];
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.earmarked).toBe(R(10000));
    expect(gauge.left).toBe(R(44600));
  });

  it('отложенное раньше тоже не свободно', () => {
    const doc = baseDoc();
    doc.settings.firstMonth = '2026-01';
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-02', amount: R(10000) }])];
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.carried).toBe(R(156000));
    expect(gauge.earmarked).toBe(0);
  });

  it('закрытая копилка метку снимает — как на экране накоплений', () => {
    const doc = baseDoc();
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-03', amount: R(10000) }])];
    doc.goals[0]!.archived = true;
    expect(budgetGauge(doc, '2026-03', TODAY).left).toBe(R(54600));
  });

  it('взнос в копилку не красит шкалу: отложить — это и есть накопить', () => {
    const plain = budgetGauge(baseDoc(R(50000)), '2026-03', TODAY).state;
    const doc = baseDoc(R(50000));
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-03', amount: R(30000) }])];
    expect(budgetGauge(doc, '2026-03', TODAY).state).toBe(plain);
  });
});

describe('шкала из трёх частей', () => {
  it('свободно, ещё придёт и ушло вместе дают всю шкалу', () => {
    const doc = splitSalary(baseDoc());
    doc.settings.startingBalance = R(20000);
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-03', amount: R(5000) }])];
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    const scale = gauge.carried + gauge.total;
    expect(gauge.left + gauge.pending + gauge.spent + gauge.earmarked).toBe(scale);
    expect(gauge.fill).toBeCloseTo(gauge.left / scale, 9);
    expect(gauge.pendingFill).toBeCloseTo(gauge.pending / scale, 9);
  });

  it('первое число: заливка — только стартовое, остальное «ещё придёт»', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-10';
    doc.settings.startingBalance = R(40000);
    splitSalary(doc);
    const gauge = budgetGauge(doc, '2026-10', '2026-10-01');
    expect(gauge.fill).toBeCloseTo(40000 / 160000, 9);
    expect(gauge.pendingFill).toBeCloseTo(120000 / 160000, 9);
  });

  it('ниже нуля заливка не опускается', () => {
    const doc = baseDoc();
    doc.expenses.push(expense('2026-03-10', R(90000), CAT_TECH, 'ONE_OFF'));
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.left).toBeLessThan(0);
    expect(gauge.fill).toBe(0);
  });

  it('без денег шкалы нет', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-03';
    const gauge = budgetGauge(doc, '2026-03', TODAY);
    expect(gauge.fill).toBe(0);
    expect(gauge.pendingFill).toBe(0);
    expect(gauge.state).toBe('SAFE');
  });
});

describe('цвет — от плана месяца', () => {
  it('зарплата ещё не пришла — это не провал', () => {
    // Аванс 20-го впереди, «Осталось» в минусе, но месяц по плану идёт хорошо
    const gauge = budgetGauge(splitSalary(baseDoc(R(30000))), '2026-03', TODAY);
    expect(gauge.left).toBeLessThan(0);
    expect(gauge.state).toBe('SAFE');
  });

  it('без цели зелёная, пока план не ушёл в минус', () => {
    expect(budgetGauge(baseDoc(), '2026-03', TODAY).state).toBe('SAFE');
  });

  it('без цели красная при перерасходе', () => {
    const doc = baseDoc();
    doc.expenses.push(expense('2026-03-10', R(90000), CAT_TECH, 'ONE_OFF'));
    expect(budgetGauge(doc, '2026-03', TODAY).state).toBe('SHORT');
  });

  it('заметно больше цели — зелёная', () => {
    expect(budgetGauge(baseDoc(R(30000)), '2026-03', TODAY).state).toBe('SAFE');
  });

  it('вплотную к цели — оранжевая', () => {
    // 54 600 против цели 50 000: запас 9,2%, меньше порога в 15%
    expect(budgetGauge(baseDoc(R(50000)), '2026-03', TODAY).state).toBe('NEAR');
  });

  it('меньше цели — красная', () => {
    expect(budgetGauge(baseDoc(R(60000)), '2026-03', TODAY).state).toBe('SHORT');
  });

  it('граница между зелёной и оранжевой ровно на пороге', () => {
    const net = R(54600);
    const justSafe = Math.floor(net / (1 + NEAR_TARGET_MARGIN)) - 1;
    const justNear = Math.floor(net / (1 + NEAR_TARGET_MARGIN)) + 1;
    expect(budgetGauge(baseDoc(justSafe), '2026-03', TODAY).state).toBe('SAFE');
    expect(budgetGauge(baseDoc(justNear), '2026-03', TODAY).state).toBe('NEAR');
  });

  it('граница между оранжевой и красной — ровно цель', () => {
    const net = R(54600);
    expect(budgetGauge(baseDoc(net), '2026-03', TODAY).state).toBe('NEAR');
    expect(budgetGauge(baseDoc(net + 1), '2026-03', TODAY).state).toBe('SHORT');
  });
});

describe('риска цели — где заливка должна остаться к концу месяца', () => {
  /** Закрытый месяц: всё пришло и ушло, заливка там, где месяц кончился. */
  function closedFebruary(target: number, contribution = 0): BudgetDocument {
    const doc = baseDoc();
    doc.settings.firstMonth = '2026-01';
    doc.settings.targets = [{ fromMonth: '2026-01', amount: target }];
    doc.expenses = dailyRoutineExpenses('2026-02', 28, R(1000), CAT_FOOD);
    if (contribution > 0) doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-02', amount: contribution }])];
    return doc;
  }

  it('в закрытом месяце заливка правее риски ровно тогда, когда шкала не красная', () => {
    // Февраль: 120 000 − 37 000 − 28 000 = 55 000
    for (const target of [R(10000), R(40000), R(55000), R(60000), R(90000)]) {
      const gauge = budgetGauge(closedFebruary(target), '2026-02', TODAY);
      expect(gauge.fill >= gauge.targetMark!).toBe(gauge.state !== 'SHORT');
    }
  });

  it('то же с копилкой: отложенное засчитано в цель', () => {
    for (const target of [R(10000), R(40000), R(55000), R(60000)]) {
      const gauge = budgetGauge(closedFebruary(target, R(20000)), '2026-02', TODAY);
      expect(gauge.fill >= gauge.targetMark!).toBe(gauge.state !== 'SHORT');
    }
  });

  it('без цели риски нет', () => {
    expect(budgetGauge(baseDoc(), '2026-03', TODAY).targetMark).toBeNull();
  });

  it('нулевая цель риски не рисует', () => {
    expect(budgetGauge(baseDoc(0), '2026-03', TODAY).targetMark).toBeNull();
  });

  it('цель, целиком закрытая копилками, риски не рисует', () => {
    const doc = baseDoc(R(30000));
    doc.goals = [goal('Отпуск', R(100000), [{ month: '2026-03', amount: R(30000) }])];
    expect(budgetGauge(doc, '2026-03', TODAY).targetMark).toBeNull();
  });
});

describe('нулевая цель', () => {
  it('сохраняется как цель, а не как её отсутствие', () => {
    expect(budgetGauge(baseDoc(0), '2026-03', TODAY).target).toBe(0);
  });

  it('шкала зелёная, пока план не ушёл в минус', () => {
    expect(budgetGauge(baseDoc(0), '2026-03', TODAY).state).toBe('SAFE');
  });

  it('прошлые месяцы сохраняют прежнюю цель', () => {
    const doc = baseDoc();
    doc.settings.firstMonth = '2026-01';
    doc.settings.targets = [
      { fromMonth: '2026-01', amount: R(30000) },
      { fromMonth: '2026-03', amount: 0 },
    ];
    expect(budgetGauge(doc, '2026-02', TODAY).target).toBe(R(30000));
    expect(budgetGauge(doc, '2026-03', TODAY).target).toBe(0);
  });
});
