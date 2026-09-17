import { describe, expect, it } from 'vitest';
import { validateDocument } from '../src/domain/validate';
import type { FatalCode, FixCode } from '../src/domain/validate';
import { CURRENT_SCHEMA_VERSION } from '../src/domain/types';
import { emptyDoc, R } from './fixtures';

const codes = (list: { code: string }[]): string[] => list.map((x) => x.code);

function expectFatal(input: unknown, code: FatalCode) {
  const res = validateDocument(input);
  expect(codes(res.fatal)).toContain(code);
  // Нечинимое останавливает загрузку: документа на выходе нет
  expect(res.doc).toBeNull();
  return res;
}

function expectFix(input: unknown, code: FixCode) {
  const res = validateDocument(input);
  expect(res.fatal).toEqual([]);
  expect(codes(res.fixed)).toContain(code);
  expect(res.doc).not.toBeNull();
  return res;
}

describe('чистый документ проходит без замечаний', () => {
  it('ни fixed, ни fatal', () => {
    const res = validateDocument(emptyDoc());
    expect(res.fatal).toEqual([]);
    expect(res.fixed).toEqual([]);
    expect(res.doc).not.toBeNull();
  });
});

describe('нечинимое (4.7) — загрузка останавливается', () => {
  it('документ не объект', () => {
    expectFatal('не документ', 'NOT_AN_OBJECT');
    expectFatal(null, 'NOT_AN_OBJECT');
    expectFatal([1, 2, 3], 'NOT_AN_OBJECT');
  });

  it('schemaVersion из будущего', () => {
    const doc = { ...emptyDoc(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expectFatal(doc, 'SCHEMA_FROM_FUTURE');
  });

  it('schemaVersion нечитаем', () => {
    expectFatal({ ...emptyDoc(), schemaVersion: '3' }, 'SCHEMA_VERSION_INVALID');
  });

  it('дробная сумма у операции', () => {
    const doc = emptyDoc();
    doc.expenses.push({
      id: 'e1',
      date: '2026-03-16',
      amount: 1240.5,
      categoryId: 'c-food',
      createdAt: '2026-03-16T10:00:00Z',
    });
    expectFatal(doc, 'FRACTIONAL_AMOUNT');
  });

  it('отрицательная сумма у операции', () => {
    const doc = emptyDoc();
    doc.expenses.push({
      id: 'e1',
      date: '2026-03-16',
      amount: -1000,
      categoryId: 'c-food',
      createdAt: '2026-03-16T10:00:00Z',
    });
    expectFatal(doc, 'NON_POSITIVE_AMOUNT');
  });

  it('нулевая сумма — тоже не положительная', () => {
    const doc = emptyDoc();
    doc.expenses.push({
      id: 'e1',
      date: '2026-03-16',
      amount: 0,
      categoryId: 'c-food',
      createdAt: '2026-03-16T10:00:00Z',
    });
    expectFatal(doc, 'NON_POSITIVE_AMOUNT');
  });

  it('дробная сумма у постоянной позиции', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Аренда',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'MONTHLY',
      amounts: [{ fromMonth: '2026-01', amount: 3500050.7 }],
    });
    expectFatal(doc, 'FRACTIONAL_AMOUNT');
  });

  it('постоянная позиция с пустым списком сумм', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Аренда',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'MONTHLY',
      amounts: [],
    });
    expectFatal(doc, 'EMPTY_PERIODS');
  });

  it('размазанная позиция с пустым списком периодов', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Страховка',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'SPREAD',
      spreads: [],
    });
    expectFatal(doc, 'EMPTY_PERIODS');
  });

  it('цикл SPREAD короче двух месяцев', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Страховка',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'SPREAD',
      spreads: [{ fromMonth: '2026-01', totalAmount: R(14500), months: 1 }],
    });
    expectFatal(doc, 'INVALID_SPREAD_MONTHS');
  });

  it('битая дата операции', () => {
    const doc = emptyDoc();
    doc.expenses.push({
      id: 'e1',
      date: '2026-02-30',
      amount: R(1240),
      categoryId: 'c-food',
      createdAt: '2026-03-16T10:00:00Z',
    });
    expectFatal(doc, 'INVALID_DATE');
  });

  it('нечитаемое направление категории', () => {
    const doc = emptyDoc();
    (doc.categories[0] as { kind: string }).kind = 'СМЕШАННОЕ';
    expectFatal(doc, 'INVALID_KIND');
  });

  it('нечитаемый режим постоянной позиции', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Аренда',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'WEEKLY',
      amounts: [{ fromMonth: '2026-01', amount: R(35000) }],
    } as never);
    expectFatal(doc, 'INVALID_MODE');
  });

  it('пустое название категории', () => {
    const doc = emptyDoc();
    doc.categories[0]!.name = '   ';
    expectFatal(doc, 'EMPTY_TEXT');
  });

  it('нет блока настроек', () => {
    const doc = emptyDoc() as Partial<ReturnType<typeof emptyDoc>>;
    delete doc.settings;
    expectFatal(doc, 'SETTINGS_INVALID');
  });

  it('нечитаемый первый месяц учёта', () => {
    const doc = emptyDoc();
    doc.settings.firstMonth = '2026-13';
    expectFatal(doc, 'SETTINGS_INVALID');
  });

  it('дробная стартовая сумма', () => {
    const doc = emptyDoc();
    doc.settings.startingBalance = 21500055.5;
    expectFatal(doc, 'FRACTIONAL_AMOUNT');
  });
});

describe('чинимое (4.7) — правится и регистрируется', () => {
  it('несортированный amounts восстанавливается по возрастанию', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Аренда',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'MONTHLY',
      amounts: [
        { fromMonth: '2026-06', amount: R(40000) },
        { fromMonth: '2026-01', amount: R(35000) },
      ],
    });
    const res = expectFix(doc, 'SORTED_PERIODS');
    const item = res.doc!.fixedItems[0]!;
    expect(item.mode).toBe('MONTHLY');
    expect(item.mode === 'MONTHLY' && item.amounts.map((a) => a.fromMonth)).toEqual(['2026-01', '2026-06']);
  });

  it('дубль MonthOverride — берётся последний', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Аренда',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'MONTHLY',
      amounts: [{ fromMonth: '2026-01', amount: R(35000) }],
    });
    doc.overrides.push(
      { month: '2026-04', fixedItemId: 'f1', amount: R(36000) },
      { month: '2026-04', fixedItemId: 'f1', amount: R(37000) },
    );
    const res = expectFix(doc, 'DEDUPED_OVERRIDE');
    expect(res.doc!.overrides).toHaveLength(1);
    expect(res.doc!.overrides[0]!.amount).toBe(R(37000));
  });

  it('операция со ссылкой на исчезнувшую категорию переносится в «Прочее»', () => {
    const doc = emptyDoc();
    doc.expenses.push({
      id: 'e1',
      date: '2026-03-16',
      amount: R(1240),
      categoryId: 'c-удалённая',
      createdAt: '2026-03-16T10:00:00Z',
    });
    const res = expectFix(doc, 'ORPHAN_CATEGORY_REF');
    expect(codes(res.fixed)).toContain('CREATED_FALLBACK_CATEGORY');
    const moved = res.doc!.expenses[0]!;
    const target = res.doc!.categories.find((c) => c.id === moved.categoryId)!;
    expect(target.name).toBe('Прочее');
    expect(target.kind).toBe('EXPENSE');
    // Сумма и дата не тронуты: перенос не теряет данные
    expect(moved.amount).toBe(R(1240));
    expect(moved.date).toBe('2026-03-16');
  });

  it('существующая категория «Прочее» переиспользуется, новая не плодится', () => {
    const doc = emptyDoc();
    doc.categories.push({
      id: 'c-misc',
      name: 'Прочее',
      kind: 'EXPENSE',
      essential: false,
      defaultFlow: 'ONE_OFF',
      icon: '🧾',
      color: '#6B7A70',
      archived: false,
      sortOrder: 9,
    });
    doc.expenses.push({
      id: 'e1',
      date: '2026-03-16',
      amount: R(1240),
      categoryId: 'нет-такой',
      createdAt: '2026-03-16T10:00:00Z',
    });
    const res = expectFix(doc, 'ORPHAN_CATEGORY_REF');
    expect(codes(res.fixed)).not.toContain('CREATED_FALLBACK_CATEGORY');
    expect(res.doc!.expenses[0]!.categoryId).toBe('c-misc');
  });

  it('пробелы по краям названия срезаются', () => {
    const doc = emptyDoc();
    doc.categories[1]!.name = '  Продукты  ';
    const res = expectFix(doc, 'TRIMMED_TEXT');
    expect(res.doc!.categories.find((c) => c.id === 'c-food')!.name).toBe('Продукты');
  });

  it('слишком длинное название обрезается до 40 символов', () => {
    const doc = emptyDoc();
    doc.categories[1]!.name = 'П'.repeat(60);
    const res = expectFix(doc, 'TRUNCATED_TEXT');
    expect(res.doc!.categories.find((c) => c.id === 'c-food')!.name).toHaveLength(40);
  });

  it('дубль названия в пределах kind переименовывается', () => {
    const doc = emptyDoc();
    doc.categories.push({ ...doc.categories[1]!, id: 'c-food-2', name: 'ПРОДУКТЫ', sortOrder: 9 });
    const res = expectFix(doc, 'DUPLICATE_CATEGORY_NAME');
    const names = res.doc!.categories.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('одинаковые названия в разных kind — не дубль', () => {
    const doc = emptyDoc();
    doc.categories.push({ ...doc.categories[1]!, id: 'c-misc-in', name: 'Прочее', kind: 'INCOME', sortOrder: 8 });
    doc.categories.push({ ...doc.categories[1]!, id: 'c-misc-ex', name: 'Прочее', kind: 'EXPENSE', sortOrder: 9 });
    const res = validateDocument(doc);
    expect(res.fatal).toEqual([]);
    expect(codes(res.fixed)).not.toContain('DUPLICATE_CATEGORY_NAME');
  });

  it('заметка длиннее 200 символов обрезается', () => {
    const doc = emptyDoc();
    doc.expenses.push({
      id: 'e1',
      date: '2026-03-16',
      amount: R(1240),
      categoryId: 'c-food',
      note: 'я'.repeat(250),
      createdAt: '2026-03-16T10:00:00Z',
    });
    const res = expectFix(doc, 'TRUNCATED_TEXT');
    expect(res.doc!.expenses[0]!.note).toHaveLength(200);
  });

  it('поток у дохода убирается: у INCOME он не определён', () => {
    const doc = emptyDoc();
    doc.expenses.push({
      id: 'e1',
      date: '2026-03-16',
      amount: R(20000),
      categoryId: 'c-salary',
      flow: 'ONE_OFF',
      createdAt: '2026-03-16T10:00:00Z',
    });
    const res = expectFix(doc, 'DROPPED_FLOW');
    expect(res.doc!.expenses[0]!.flow).toBeUndefined();
  });

  it('kind позиции приводится к kind категории', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Аренда',
      kind: 'INCOME',
      categoryId: 'c-home',
      mode: 'MONTHLY',
      amounts: [{ fromMonth: '2026-01', amount: R(35000) }],
    });
    const res = expectFix(doc, 'FIXED_KIND_FROM_CATEGORY');
    expect(res.doc!.fixedItems[0]!.kind).toBe('EXPENSE');
  });

  it('endMonth раньше начала подтягивается к первому fromMonth', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Аренда',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      endMonth: '2025-06',
      mode: 'MONTHLY',
      amounts: [{ fromMonth: '2026-01', amount: R(35000) }],
    });
    const res = expectFix(doc, 'CLAMPED_END_MONTH');
    expect(res.doc!.fixedItems[0]!.endMonth).toBe('2026-01');
  });

  it('payDay вне 1..31 убирается: он только для напоминания', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Страховка',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'SPREAD',
      spreads: [{ fromMonth: '2026-01', totalAmount: R(14500), months: 12, payDay: 45 }],
    });
    const res = expectFix(doc, 'DROPPED_PAY_DAY');
    const item = res.doc!.fixedItems[0]!;
    expect(item.mode === 'SPREAD' && item.spreads[0]!.payDay).toBeUndefined();
  });

  it('оверрайд без позиции выбрасывается', () => {
    const doc = emptyDoc();
    doc.overrides.push({ month: '2026-04', fixedItemId: 'нет-такой', amount: R(1000) });
    const res = expectFix(doc, 'DROPPED_ORPHAN_OVERRIDE');
    expect(res.doc!.overrides).toEqual([]);
  });

  it('отсутствующий список подставляется пустым', () => {
    const doc = emptyDoc() as Partial<ReturnType<typeof emptyDoc>>;
    delete doc.goals;
    const res = expectFix(doc, 'MISSING_ARRAY');
    expect(res.doc!.goals).toEqual([]);
  });

  it('несортированные цели по накоплению выстраиваются по возрастанию', () => {
    const doc = emptyDoc();
    doc.settings.targets = [
      { fromMonth: '2026-06', amount: R(50000) },
      { fromMonth: '2026-01', amount: R(40000) },
    ];
    const res = expectFix(doc, 'SORTED_TARGETS');
    expect(res.doc!.settings.targets.map((t) => t.fromMonth)).toEqual(['2026-01', '2026-06']);
  });

  it('настройка вне диапазона заменяется дефолтом из 1.8', () => {
    const doc = emptyDoc();
    doc.settings.forecastMinDay = 0;
    doc.settings.oneOffWindow = -3;
    const res = expectFix(doc, 'SETTINGS_DEFAULTED');
    expect(res.doc!.settings.forecastMinDay).toBe(5);
    expect(res.doc!.settings.oneOffWindow).toBe(6);
  });

  it('defaultFlow без значения получает ROUTINE — как в миграции 2→3', () => {
    const doc = emptyDoc();
    delete (doc.categories[1] as Partial<(typeof doc.categories)[number]>).defaultFlow;
    const res = expectFix(doc, 'CATEGORY_FIELD_DEFAULTED');
    expect(res.doc!.categories.find((c) => c.id === 'c-food')!.defaultFlow).toBe('ROUTINE');
  });

  it('срок цели раньше месяца создания подтягивается к нему', () => {
    const doc = emptyDoc();
    doc.goals.push({
      id: 'g1',
      title: 'Новый ПК',
      targetAmount: R(300000),
      deadline: '2025-01',
      contributions: [],
      archived: false,
      createdAt: '2026-01-15T10:00:00Z',
    });
    const res = expectFix(doc, 'CLAMPED_DEADLINE');
    expect(res.doc!.goals[0]!.deadline).toBe('2026-01');
  });
});

describe('валидатор не трогает вход', () => {
  it('чинит копию, исходный объект остаётся как был', () => {
    const doc = emptyDoc();
    doc.fixedItems.push({
      id: 'f1',
      title: 'Аренда',
      kind: 'EXPENSE',
      categoryId: 'c-home',
      mode: 'MONTHLY',
      amounts: [
        { fromMonth: '2026-06', amount: R(40000) },
        { fromMonth: '2026-01', amount: R(35000) },
      ],
    });
    validateDocument(doc);
    const item = doc.fixedItems[0]!;
    expect(item.mode === 'MONTHLY' && item.amounts[0]!.fromMonth).toBe('2026-06');
  });
});

describe('нулевая цель по накоплению', () => {
  it('проходит загрузку как есть', () => {
    const doc = emptyDoc();
    doc.settings.targets = [{ fromMonth: '2026-01', amount: 0 }];
    const res = validateDocument(doc);
    expect(res.fatal).toEqual([]);
    expect(res.doc!.settings.targets).toEqual([{ fromMonth: '2026-01', amount: 0 }]);
  });

  it('отрицательная цель по-прежнему не проходит', () => {
    const doc = emptyDoc();
    doc.settings.targets = [{ fromMonth: '2026-01', amount: -R(1000) }];
    expectFatal(doc, 'NON_POSITIVE_AMOUNT');
  });

  it('дробная цель по-прежнему не проходит', () => {
    const doc = emptyDoc();
    doc.settings.targets = [{ fromMonth: '2026-01', amount: 1000.5 }];
    expectFatal(doc, 'FRACTIONAL_AMOUNT');
  });
});
