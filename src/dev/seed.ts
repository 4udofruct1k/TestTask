/**
 * Подставной документ на полгода истории — режим разработки (5.11).
 *
 * Иначе дашборды проверить не на чем: на пустом документе все графики пустые.
 * В сборку для телефона не попадает, вызывается только под import.meta.env.DEV.
 */

import { addMonths, daysInMonth, monthKeyOf } from '../domain/dates';
import { createInitialDocument } from '../domain/defaults';
import type { BudgetDocument, DateStr, Expense, MonthKey } from '../domain/types';

const R = (rubles: number): number => Math.round(rubles * 100);

/** Детерминированный генератор: один и тот же сид даёт один и тот же документ. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

export function seedDocument(today: DateStr): BudgetDocument {
  const random = makeRandom(20260316);
  let counter = 0;
  const id = (): string => `seed-${++counter}`;

  const currentMonth = monthKeyOf(today);
  const firstMonth = addMonths(currentMonth, -5);
  const doc = createInitialDocument(firstMonth, `${firstMonth}-01T00:00:00Z`, id);

  doc.settings.startingBalance = R(215000);
  doc.settings.targets = [{ fromMonth: firstMonth, amount: R(30000) }];

  const category = (name: string): string => doc.categories.find((c) => c.name === name)!.id;

  doc.fixedItems = [
    {
      id: id(),
      title: 'Зарплата',
      kind: 'INCOME',
      categoryId: category('Зарплата'),
      mode: 'MONTHLY',
      // Повышение с середины истории — видно, что прошлое не переписывается
      amounts: [
        { fromMonth: firstMonth, amount: R(112000) },
        { fromMonth: addMonths(firstMonth, 3), amount: R(120000) },
      ],
    },
    {
      id: id(),
      title: 'Аренда',
      kind: 'EXPENSE',
      categoryId: category('Жильё'),
      mode: 'MONTHLY',
      amounts: [{ fromMonth: firstMonth, amount: R(32000) }],
    },
    {
      id: id(),
      title: 'Связь',
      kind: 'EXPENSE',
      categoryId: category('Связь'),
      mode: 'MONTHLY',
      amounts: [{ fromMonth: firstMonth, amount: R(800) }],
    },
    {
      id: id(),
      title: 'Интернет',
      kind: 'EXPENSE',
      categoryId: category('Связь'),
      mode: 'MONTHLY',
      amounts: [{ fromMonth: firstMonth, amount: R(700) }],
    },
    {
      id: id(),
      title: 'Подписки',
      kind: 'EXPENSE',
      categoryId: category('Подписки'),
      mode: 'MONTHLY',
      amounts: [{ fromMonth: firstMonth, amount: R(1600) }],
    },
    {
      id: id(),
      title: 'Страховка',
      kind: 'EXPENSE',
      categoryId: category('Жильё'),
      mode: 'SPREAD',
      spreads: [
        {
          fromMonth: firstMonth,
          totalAmount: R(14400),
          months: 12,
          payMonth: addMonths(currentMonth, 2),
          payDay: 14,
        },
      ],
    },
  ];

  const routine: { name: string; min: number; max: number; chance: number }[] = [
    { name: 'Продукты', min: 900, max: 2800, chance: 0.6 },
    { name: 'Кафе', min: 300, max: 1400, chance: 0.45 },
    { name: 'Транспорт', min: 120, max: 400, chance: 0.5 },
    { name: 'Здоровье', min: 400, max: 2000, chance: 0.08 },
  ];

  const oneOff: { name: string; min: number; max: number }[] = [
    { name: 'Техника', min: 4000, max: 41000 },
    { name: 'Одежда', min: 2000, max: 12000 },
    { name: 'Подарки', min: 1500, max: 6000 },
    { name: 'Развлечения', min: 800, max: 5000 },
  ];

  const expenses: Expense[] = [];
  const todayDay = Number(today.slice(8, 10));

  for (let i = 0; i <= 5; i++) {
    const month: MonthKey = addMonths(firstMonth, i);
    const isCurrent = month === currentMonth;
    const lastDay = isCurrent ? todayDay : daysInMonth(month);

    for (let day = 1; day <= lastDay; day++) {
      const date: DateStr = `${month}-${String(day).padStart(2, '0')}`;
      for (const kind of routine) {
        if (random() > kind.chance) continue;
        expenses.push({
          id: id(),
          date,
          amount: R(Math.round(kind.min + random() * (kind.max - kind.min))),
          categoryId: category(kind.name),
          createdAt: `${date}T12:00:00Z`,
        });
      }
    }

    // Один-два разовых в месяц, иногда ни одного — ряд должен быть рваным
    const purchases = random() < 0.25 ? 0 : random() < 0.7 ? 1 : 2;
    for (let k = 0; k < purchases; k++) {
      const pick = oneOff[Math.floor(random() * oneOff.length)]!;
      const day = 1 + Math.floor(random() * Math.max(1, lastDay - 1));
      const date: DateStr = `${month}-${String(day).padStart(2, '0')}`;
      expenses.push({
        id: id(),
        date,
        amount: R(Math.round(pick.min + random() * (pick.max - pick.min))),
        categoryId: category(pick.name),
        createdAt: `${date}T15:00:00Z`,
      });
    }

    // Премия в двух месяцах — разовый доход
    if (i === 1 || i === 4) {
      const date: DateStr = `${month}-20`;
      expenses.push({
        id: id(),
        date,
        amount: R(18000),
        categoryId: category('Премия'),
        createdAt: `${date}T10:00:00Z`,
      });
    }
  }

  doc.expenses = expenses;

  doc.goals = [
    {
      id: id(),
      title: 'Новый ПК',
      targetAmount: R(300000),
      deadline: addMonths(currentMonth, 9),
      contributions: [0, 1, 2, 3, 4].map((i) => ({
        id: id(),
        month: addMonths(firstMonth, i),
        amount: R(24000 + i * 2000),
      })),
      archived: false,
      createdAt: `${firstMonth}-05T10:00:00Z`,
    },
    {
      id: id(),
      title: 'Поездка летом',
      targetAmount: R(90000),
      deadline: addMonths(currentMonth, 4),
      contributions: [1, 3, 5].map((i) => ({
        id: id(),
        month: addMonths(firstMonth, i),
        amount: R(24000),
      })),
      archived: false,
      createdAt: `${firstMonth}-05T10:00:00Z`,
    },
  ];

  // Один пропущенный платёж — чтобы оверрайды не лежали мёртвым кодом
  doc.overrides = [
    { month: addMonths(currentMonth, -2), fixedItemId: doc.fixedItems[4]!.id, amount: null },
  ];

  return doc;
}
