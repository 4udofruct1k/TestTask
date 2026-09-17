/**
 * Приёмка расчётного движка — тестовые кейсы 2.14, К1 по К11.
 * Числа ровно те, что в спецификации. Не сходится тест — ошибка в коде.
 */

import { describe, expect, it } from 'vitest';
import { formatAmount } from '../src/domain/money';
import {
  amountAt,
  annualCalendar,
  compareToPrevious,
  cumulativeByDay,
  goalProgress,
  monthForecast,
  monthSummary,
  oneOffAnalysis,
  targetStatus,
} from '../src/engine';
import type { BudgetDocument } from '../src/domain/types';
import { dailyRoutineExpenses, emptyDoc, expense, goal, monthly, R, spread } from './fixtures';

const CAT_SALARY = 'c-salary';
const CAT_FOOD = 'c-food';
const CAT_TECH = 'c-tech';
const CAT_HOME = 'c-home';

/** Условия К1: зарплата 120 000, аренда 35 000, связь 800, подписки 1 200. */
function baseDoc(): BudgetDocument {
  const doc = emptyDoc();
  doc.settings.firstMonth = '2026-01';
  doc.fixedItems = [
    monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(120000) }]),
    monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(35000) }]),
    monthly('Связь', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(800) }]),
    monthly('Подписки', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(1200) }]),
  ];
  return doc;
}

/** Март: 16 рутинных трат по 1 775 ₽ = 28 400 ₽. Февраль: 16 по 1 950 ₽ = 31 200 ₽. */
function withRoutine(doc: BudgetDocument): BudgetDocument {
  doc.expenses = [
    ...dailyRoutineExpenses('2026-03', 16, R(1775), CAT_FOOD),
    ...dailyRoutineExpenses('2026-02', 16, R(1950), CAT_FOOD),
  ];
  return doc;
}

describe('К1. Базовый месяц', () => {
  const doc = withRoutine(baseDoc());
  const summary = monthSummary(doc, '2026-03', '2026-03-16');

  it('fixedIncome 120 000', () => expect(summary.fixedIncome).toBe(R(120000)));
  it('fixedExpense 37 000', () => expect(summary.fixedExpense).toBe(R(37000)));
  it('free 83 000', () => expect(summary.free).toBe(R(83000)));
  it('переменных трат 28 400', () => expect(summary.variableExpense).toBe(R(28400)));
  it('net 54 600', () => expect(summary.net).toBe(R(54600)));
  it('savingsRate 0,455', () => expect(summary.savingsRate).toBeCloseTo(0.455, 6));
  it('стоимость жизни — постоянные плюс рутина', () =>
    expect(summary.costOfLiving).toBe(R(37000) + R(28400)));
});

describe('К2. Повышение суммы не переписывает прошлое', () => {
  const rent = monthly('Аренда', 'EXPENSE', CAT_HOME, [
    { fromMonth: '2026-01', amount: R(35000) },
    { fromMonth: '2026-06', amount: R(40000) },
  ]);

  it('amountAt(2026-05) → 35 000', () => expect(amountAt(rent, '2026-05')).toBe(R(35000)));
  it('amountAt(2026-06) → 40 000', () => expect(amountAt(rent, '2026-06')).toBe(R(40000)));
  it('amountAt(2026-07) → 40 000', () => expect(amountAt(rent, '2026-07')).toBe(R(40000)));
  it('amountAt(2025-12) → не действует', () => expect(amountAt(rent, '2025-12')).toBeNull());
  it('endMonth закрывает позицию', () => {
    const closed = monthly('Аренда', 'EXPENSE', CAT_HOME, [{ fromMonth: '2026-01', amount: R(35000) }], '2026-03');
    expect(amountAt(closed, '2026-03')).toBe(R(35000));
    expect(amountAt(closed, '2026-04')).toBeNull();
  });
});

describe('К3. Оверрайды', () => {
  function docWithBonus(): BudgetDocument {
    const doc = baseDoc();
    doc.fixedItems.push(monthly('Премия', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(20000) }]));
    return doc;
  }

  it('премия не пришла в марте — fixedIncome без неё', () => {
    const doc = docWithBonus();
    const bonus = doc.fixedItems[4]!;
    doc.overrides = [{ month: '2026-03', fixedItemId: bonus.id, amount: null }];
    expect(monthSummary(doc, '2026-03', '2026-03-16').fixedIncome).toBe(R(120000));
    expect(monthSummary(doc, '2026-04', '2026-03-16').fixedIncome).toBe(R(140000));
  });

  it('аренда разово 37 000 в апреле, в мае снова 35 000', () => {
    const doc = docWithBonus();
    const rent = doc.fixedItems[1]!;
    doc.overrides = [{ month: '2026-04', fixedItemId: rent.id, amount: R(37000) }];
    const april = monthSummary(doc, '2026-04', '2026-03-16');
    const may = monthSummary(doc, '2026-05', '2026-03-16');
    expect(april.fixedExpense).toBe(R(39000));
    expect(may.fixedExpense).toBe(R(37000));
  });

  it('оверрайд для месяца, где позиция не действует, игнорируется', () => {
    const doc = docWithBonus();
    const rent = doc.fixedItems[1]!;
    doc.overrides = [{ month: '2025-12', fixedItemId: rent.id, amount: R(99000) }];
    expect(monthSummary(doc, '2025-12', '2026-03-16').fixedExpense).toBe(0);
  });
});

describe('К4. Темп и сравнение', () => {
  const doc = withRoutine(baseDoc());
  const today = '2026-03-16';
  const forecast = monthForecast(doc, '2026-03', today)!;
  const comparison = compareToPrevious(doc, '2026-03', today);

  it('routinePace 1 775 в день', () => expect(forecast.routinePace).toBe(R(1775)));
  it('routineForecast 1 775 × 31 = 55 025', () => expect(forecast.routineForecast).toBe(R(55025)));
  it('forecast 55 025', () => expect(forecast.forecast).toBe(R(55025)));
  it('февраль на 16-е число: 31 200', () => expect(comparison.previous).toBe(R(31200)));
  it('обрезка по одному дню для обоих месяцев', () => expect(comparison.cutoffDay).toBe(16));
  it('delta −2 800', () => expect(comparison.delta).toBe(-R(2800)));
  it('deltaPct −8,97%', () => expect(comparison.deltaPct).toBeCloseTo(-0.0897, 4));
  it('прогноз для прошедшего месяца не считается', () =>
    expect(monthForecast(doc, '2026-02', today)).toBeNull());
});

describe('К5. Цель', () => {
  const doc = withRoutine(baseDoc());
  doc.settings.targets = [{ fromMonth: '2026-01', amount: R(40000) }];
  const status = targetStatus(doc, '2026-03', '2026-03-16')!;

  it('budget 83 000 − 40 000 = 43 000', () => expect(status.budget).toBe(R(43000)));
  it('spent 28 400', () => expect(status.spent).toBe(R(28400)));
  it('committed 28 400', () => expect(status.committed).toBe(R(28400)));
  it('remaining 14 600', () => expect(status.remaining).toBe(R(14600)));
  it('daysLeft 16, сегодня включительно', () => expect(status.daysLeft).toBe(16));
  it('dailyAllowance 913 ₽ на экране', () => {
    expect(status.dailyAllowance).toBe(R(912.5));
    expect(formatAmount(status.dailyAllowance!)).toBe('913');
  });
  it('forecast 55 025 > 43 000 → AT_RISK', () => expect(status.state).toBe('AT_RISK'));
});

describe('К6. Недостижимая цель', () => {
  it('free 30 000 при цели 40 000 → budget −10 000 → IMPOSSIBLE', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    doc.settings.targets = [{ fromMonth: '2026-01', amount: R(40000) }];
    doc.fixedItems = [
      monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(30000) }]),
    ];
    const status = targetStatus(doc, '2026-03', '2026-03-16')!;
    expect(status.budget).toBe(-R(10000));
    expect(status.state).toBe('IMPOSSIBLE');
  });

  it('состояние не зависит от трат', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    doc.settings.targets = [{ fromMonth: '2026-01', amount: R(40000) }];
    doc.fixedItems = [
      monthly('Зарплата', 'INCOME', CAT_SALARY, [{ fromMonth: '2026-01', amount: R(30000) }]),
    ];
    doc.expenses = [expense('2026-03-02', R(100), CAT_FOOD)];
    expect(targetStatus(doc, '2026-03', '2026-03-16')!.state).toBe('IMPOSSIBLE');
  });
});

describe('К7. Февраль против марта', () => {
  const doc = withRoutine(baseDoc());
  const comparison = compareToPrevious(doc, '2026-03', '2026-03-31');

  it('cutoffDay 31', () => expect(comparison.cutoffDay).toBe(31));
  it('в феврале 28 дней → берётся последний день, previousTruncated', () => {
    expect(comparison.previousTruncated).toBe(true);
    expect(comparison.previous).toBe(R(31200));
  });
  it('прошлого месяца нет в истории → сравнение скрывается', () => {
    const start = withRoutine(baseDoc());
    start.settings.firstMonth = '2026-03';
    const first = compareToPrevious(start, '2026-03', '2026-03-16');
    expect(first.previous).toBeNull();
    expect(first.delta).toBeNull();
    expect(first.deltaPct).toBeNull();
  });
  it('previous === 0 → процент не считается', () => {
    const doc2 = baseDoc();
    doc2.expenses = dailyRoutineExpenses('2026-03', 16, R(1775), CAT_FOOD);
    const c = compareToPrevious(doc2, '2026-03', '2026-03-16');
    expect(c.previous).toBe(0);
    expect(c.delta).toBe(R(28400));
    expect(c.deltaPct).toBeNull();
  });
});

describe('К8. Взнос больше накопления', () => {
  const doc = withRoutine(baseDoc());
  doc.goals = [goal('Новый ПК', R(300000), [{ month: '2026-03', amount: R(80000) }])];

  it('net месяца 54 600 не меняется взносом в 80 000', () => {
    expect(monthSummary(doc, '2026-03', '2026-03-16').net).toBe(R(54600));
  });

  it('взнос не входит в переменные траты', () => {
    expect(monthSummary(doc, '2026-03', '2026-03-16').variableExpense).toBe(R(28400));
  });

  it('прогресс цели видит все 80 000', () => {
    expect(goalProgress(doc.goals[0]!, '2026-03-16').saved).toBe(R(80000));
  });
});

describe('К9. Разовая покупка не ломает прогноз', () => {
  const doc = withRoutine(baseDoc());
  doc.expenses.push(expense('2026-03-03', R(24000), CAT_TECH, 'ONE_OFF'));
  const forecast = monthForecast(doc, '2026-03', '2026-03-16')!;

  it('routineToDate 28 400 — покупка в рутину не попала', () => {
    expect(monthSummary(doc, '2026-03', '2026-03-16').routineToDate).toBe(R(28400));
  });
  it('routinePace 1 775', () => expect(forecast.routinePace).toBe(R(1775)));
  it('routineForecast 55 025', () => expect(forecast.routineForecast).toBe(R(55025)));
  it('oneOffExpense 24 000', () =>
    expect(monthSummary(doc, '2026-03', '2026-03-16').oneOffExpense).toBe(R(24000)));
  it('forecast 79 025', () => expect(forecast.forecast).toBe(R(79025)));

  it('та же покупка в рутине дала бы pace 3 275 и forecast 101 525 — расхождение 22 500', () => {
    const wrong = withRoutine(baseDoc());
    wrong.expenses.push(expense('2026-03-03', R(24000), CAT_TECH, 'ROUTINE'));
    const f = monthForecast(wrong, '2026-03', '2026-03-16')!;
    expect(f.routinePace).toBe(R(3275));
    expect(f.forecast).toBe(R(101525));
    expect(f.forecast - forecast.forecast).toBe(R(22500));
  });

  it('кривая месяца строится только по рутине', () => {
    const curve = cumulativeByDay(doc, '2026-03', '2026-03-16');
    expect(curve[15]).toBe(R(28400));
    // 3 марта — покупка на 24 000, в кривой её нет
    expect(curve[2]).toBe(R(1775) * 3);
  });

  it('дни после сегодняшнего — null, а не ноль', () => {
    const curve = cumulativeByDay(doc, '2026-03', '2026-03-16');
    expect(curve).toHaveLength(31);
    expect(curve[16]).toBeNull();
    expect(curve[30]).toBeNull();
  });
});

describe('К10. Размазанный годовой платёж', () => {
  const insurance = spread('Страховка', CAT_HOME, [
    { fromMonth: '2026-01', totalAmount: R(14500), months: 12 },
  ]);

  it('январь…ноябрь → 1 208,33', () => {
    for (let m = 1; m <= 11; m++) {
      const month = `2026-${String(m).padStart(2, '0')}`;
      expect(amountAt(insurance, month)).toBe(120833);
    }
  });

  it('декабрь → 1 208,37: остаток уходит в последний месяц цикла', () => {
    expect(amountAt(insurance, '2026-12')).toBe(120837);
  });

  it('Σ за цикл = 14 500,00 ровно', () => {
    let sum = 0;
    for (let m = 1; m <= 12; m++) sum += amountAt(insurance, `2026-${String(m).padStart(2, '0')}`)!;
    expect(sum).toBe(R(14500));
  });

  it('2027-01 → новый цикл, снова 1 208,33', () => {
    expect(amountAt(insurance, '2027-01')).toBe(120833);
    expect(amountAt(insurance, '2027-12')).toBe(120837);
  });

  it('до начала цикла позиция не действует', () => {
    expect(amountAt(insurance, '2025-12')).toBeNull();
  });

  it('доля попадает в reserved, а не отдельной строкой сверх fixedExpense', () => {
    const doc = baseDoc();
    doc.fixedItems.push(insurance);
    const summary = monthSummary(doc, '2026-03', '2026-03-16');
    expect(summary.reserved).toBe(120833);
    expect(summary.fixedExpense).toBe(R(37000) + 120833);
  });

  it('календарь показывает списание целиком в месяце платежа', () => {
    const doc = baseDoc();
    doc.fixedItems.push(insurance);
    const calendar = annualCalendar(doc, '2026-01', 12);
    expect(calendar[0]!.total).toBe(R(14500));
    expect(calendar[0]!.payments[0]!.title).toBe('Страховка');
    for (let i = 1; i < 12; i++) expect(calendar[i]!.total).toBe(0);
  });
});

describe('К11. Разовые против среднего', () => {
  const doc = emptyDoc();
  doc.settings.firstMonth = '2025-10';
  doc.expenses = [
    expense('2025-11-10', R(24000), CAT_TECH, 'ONE_OFF'),
    expense('2025-12-10', R(3500), CAT_TECH, 'ONE_OFF'),
    expense('2026-01-10', R(41000), CAT_TECH, 'ONE_OFF'),
    expense('2026-03-10', R(12000), CAT_TECH, 'ONE_OFF'),
    expense('2026-04-10', R(24000), CAT_TECH, 'ONE_OFF'),
  ];
  const analysis = oneOffAnalysis(doc, '2026-04', '2026-04-20', 6);

  it('текущий апрель — 24 000', () => expect(analysis.current).toBe(R(24000)));
  it('avg за 6 месяцев = 80 500 / 6 = 13 417', () => {
    expect(analysis.avg).toBe(1341667);
    expect(formatAmount(analysis.avg!)).toBe('13 417'.replace(' ', ' '));
  });
  it('delta +10 583', () => {
    expect(formatAmount(analysis.delta!)).toBe('10 583'.replace(' ', ' '));
  });
  it('deltaPct +78,9%', () => expect(analysis.deltaPct).toBeCloseTo(0.789, 3));
  it('столбцы по месяцам: окт 0 … мар 12 000, апрель текущий', () => {
    expect(analysis.byMonth.map((m) => m.amount)).toEqual([
      0,
      R(24000),
      R(3500),
      R(41000),
      0,
      R(12000),
      R(24000),
    ]);
  });
  it('текущий месяц помечен неполным, но по дню не обрезан', () => {
    expect(analysis.monthIncomplete).toBe(true);
    expect(analysis.current).toBe(R(24000));
  });
  it('истории хватает', () => expect(analysis.insufficientHistory).toBe(false));

  it('при истории меньше 3 полных месяцев avg = null', () => {
    const short = emptyDoc();
    short.settings.firstMonth = '2026-02';
    short.expenses = [expense('2026-03-10', R(12000), CAT_TECH, 'ONE_OFF')];
    const a = oneOffAnalysis(short, '2026-03', '2026-03-16', 6);
    expect(a.insufficientHistory).toBe(true);
    expect(a.avg).toBeNull();
    expect(a.delta).toBeNull();
    expect(a.deltaPct).toBeNull();
  });
});

describe('цель по накоплению может быть нулевой', () => {
  it('потолок трат равен всему доходу месяца', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    doc.settings.targets = [{ fromMonth: '2026-01', amount: 0 }];
    doc.fixedItems = [
      monthly('Зарплата', 'INCOME', 'c-salary', [{ fromMonth: '2026-01', amount: R(120000) }]),
      monthly('Аренда', 'EXPENSE', 'c-home', [{ fromMonth: '2026-01', amount: R(35000) }]),
    ];
    const status = targetStatus(doc, '2026-03', '2026-03-16')!;
    expect(status.target).toBe(0);
    // free = 120 000 − 35 000, тратить можно всё это
    expect(status.budget).toBe(R(85000));
  });

  it('нулевая цель отличима от незаданной', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-01';
    expect(targetStatus(doc, '2026-03', '2026-03-16')).toBeNull();
    doc.settings.targets = [{ fromMonth: '2026-01', amount: 0 }];
    expect(targetStatus(doc, '2026-03', '2026-03-16')).not.toBeNull();
  });
});
