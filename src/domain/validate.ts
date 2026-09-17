/**
 * Проверка инвариантов Части 1 при каждой загрузке документа.
 *
 * Классификация — по 4.7:
 *   fixed — чинимое. Правится молча и попадает в журнал.
 *   fatal — нечинимое. Останавливает загрузку, документ восстанавливается из бэкапа.
 *
 * Молчаливая потеря данных недопустима ни в одном случае: если что-то
 * поправлено — это видно в fixed, если нет — загрузка останавливается.
 *
 * Функция чистая: чинит глубокую копию и возвращает её, вход не трогает.
 */

import {
  compareMonth,
  isDateStr,
  isMonthKey,
  monthKeyOfIso,
} from './dates';
import { isMoney } from './money';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_FORECAST_MIN_DAY,
  DEFAULT_ONE_OFF_WINDOW,
  type AmountPeriod,
  type BudgetDocument,
  type Category,
  type Contribution,
  type Expense,
  type FixedItem,
  type Flow,
  type Kind,
  type Money,
  type MonthKey,
  type MonthlyTarget,
  type MonthOverride,
  type SavingsGoal,
  type Settings,
  type SpreadPeriod,
} from './types';

export type FixCode =
  | 'MISSING_ARRAY'
  | 'TRIMMED_TEXT'
  | 'TRUNCATED_TEXT'
  | 'DUPLICATE_CATEGORY_NAME'
  | 'CATEGORY_FIELD_DEFAULTED'
  | 'CREATED_FALLBACK_CATEGORY'
  | 'ORPHAN_CATEGORY_REF'
  | 'DROPPED_FLOW'
  | 'MISSING_CREATED_AT'
  | 'SORTED_PERIODS'
  | 'DEDUPED_PERIODS'
  | 'CLAMPED_END_MONTH'
  | 'DROPPED_PAY_DAY'
  | 'DROPPED_PAY_MONTH'
  | 'FIXED_KIND_FROM_CATEGORY'
  | 'DEDUPED_OVERRIDE'
  | 'DROPPED_ORPHAN_OVERRIDE'
  | 'SORTED_TARGETS'
  | 'DEDUPED_TARGETS'
  | 'CLAMPED_DEADLINE'
  | 'SETTINGS_DEFAULTED';

export type FatalCode =
  | 'NOT_AN_OBJECT'
  | 'SCHEMA_VERSION_INVALID'
  | 'SCHEMA_FROM_FUTURE'
  | 'INVALID_ENTITY'
  | 'EMPTY_TEXT'
  | 'INVALID_KIND'
  | 'INVALID_MODE'
  | 'INVALID_DATE'
  | 'INVALID_MONTH'
  | 'FRACTIONAL_AMOUNT'
  | 'NON_POSITIVE_AMOUNT'
  | 'EMPTY_PERIODS'
  | 'INVALID_SPREAD_MONTHS'
  | 'SETTINGS_INVALID';

export interface Fix {
  code: FixCode;
  path: string;
  message: string;
}

export interface Fatal {
  code: FatalCode;
  path: string;
  message: string;
}

export interface ValidationResult {
  /** Починенный документ. null, если есть хотя бы один fatal. */
  doc: BudgetDocument | null;
  fixed: Fix[];
  fatal: Fatal[];
}

const MAX_CATEGORY_NAME = 40;
const MAX_NOTE = 200;
const FALLBACK_CATEGORY_NAME = 'Прочее';
/** Нейтральные значения оформления из палитры 3.9 — когда в файле их нет. */
const FALLBACK_ICON = '💸';
const FALLBACK_COLOR = '#6B7A70';

export function validateDocument(
  input: unknown,
  supportedSchemaVersion: number = CURRENT_SCHEMA_VERSION,
): ValidationResult {
  const fixed: Fix[] = [];
  const fatal: Fatal[] = [];
  const fix = (code: FixCode, path: string, message: string): void => {
    fixed.push({ code, path, message });
  };
  const fail = (code: FatalCode, path: string, message: string): void => {
    fatal.push({ code, path, message });
  };

  if (!isRecord(input)) {
    fail('NOT_AN_OBJECT', '', 'Документ не является объектом');
    return { doc: null, fixed, fatal };
  }

  const doc = structuredClone(input) as Record<string, unknown>;

  // ---- schemaVersion ----------------------------------------------------
  const schemaVersion = doc['schemaVersion'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    fail('SCHEMA_VERSION_INVALID', 'schemaVersion', `Версия схемы нечитаема: ${String(schemaVersion)}`);
  } else if (schemaVersion > supportedSchemaVersion) {
    fail(
      'SCHEMA_FROM_FUTURE',
      'schemaVersion',
      `Файл версии ${schemaVersion}, поддерживается ${supportedSchemaVersion}`,
    );
  }

  // ---- массивы ----------------------------------------------------------
  const categoriesRaw = takeArray(doc, 'categories', fix);
  const expensesRaw = takeArray(doc, 'expenses', fix);
  const fixedItemsRaw = takeArray(doc, 'fixedItems', fix);
  const overridesRaw = takeArray(doc, 'overrides', fix);
  const goalsRaw = takeArray(doc, 'goals', fix);

  // ---- категории --------------------------------------------------------
  const categories: Category[] = [];
  const seenNames = new Map<string, number>();
  categoriesRaw.forEach((raw, i) => {
    const path = `categories[${i}]`;
    if (!isRecord(raw)) {
      fail('INVALID_ENTITY', path, 'Категория не является объектом');
      return;
    }
    const id = raw['id'];
    if (typeof id !== 'string' || id === '') {
      fail('INVALID_ENTITY', path, 'У категории нет идентификатора');
      return;
    }
    const kind = raw['kind'];
    if (!isKind(kind)) {
      fail('INVALID_KIND', `${path}.kind`, `Направление категории нечитаемо: ${String(kind)}`);
      return;
    }
    const rawName = raw['name'];
    if (typeof rawName !== 'string') {
      fail('INVALID_ENTITY', `${path}.name`, 'Название категории не строка');
      return;
    }
    let name = rawName.trim();
    if (name !== rawName) fix('TRIMMED_TEXT', `${path}.name`, `Убраны пробелы по краям: «${rawName}»`);
    if (name === '') {
      fail('EMPTY_TEXT', `${path}.name`, 'Пустое название категории');
      return;
    }
    if (name.length > MAX_CATEGORY_NAME) {
      fix('TRUNCATED_TEXT', `${path}.name`, `Название обрезано до ${MAX_CATEGORY_NAME} символов: «${name}»`);
      name = name.slice(0, MAX_CATEGORY_NAME);
    }
    // Уникальность в пределах kind, сравнение регистронезависимое (инвариант 2)
    const nameKey = `${kind}:${name.toLocaleLowerCase('ru-RU')}`;
    const seen = seenNames.get(nameKey);
    if (seen !== undefined) {
      const next = seen + 1;
      seenNames.set(nameKey, next);
      const renamed = `${name} (${next})`.slice(0, MAX_CATEGORY_NAME);
      fix('DUPLICATE_CATEGORY_NAME', `${path}.name`, `Дубль названия «${name}» переименован в «${renamed}»`);
      name = renamed;
    } else {
      seenNames.set(nameKey, 1);
    }

    categories.push({
      id,
      name,
      kind,
      essential: takeBoolean(raw, 'essential', false, path, fix),
      defaultFlow: takeFlow(raw, path, fix),
      icon: takeString(raw, 'icon', FALLBACK_ICON, path, fix),
      color: takeString(raw, 'color', FALLBACK_COLOR, path, fix),
      archived: takeBoolean(raw, 'archived', false, path, fix),
      sortOrder: takeNumber(raw, 'sortOrder', i, path, fix),
    });
  });

  const byId = new Map(categories.map((c) => [c.id, c]));

  /** Категория «Прочее» нужного направления. Создаётся, если её в файле нет. */
  const fallbackCache = new Map<Kind, Category>();
  const fallbackCategory = (kind: Kind, path: string): Category => {
    const cached = fallbackCache.get(kind);
    if (cached) return cached;
    const existing = categories.find(
      (c) => c.kind === kind && c.name.toLocaleLowerCase('ru-RU') === FALLBACK_CATEGORY_NAME.toLowerCase(),
    );
    if (existing) {
      fallbackCache.set(kind, existing);
      return existing;
    }
    const created: Category = {
      id: `fallback-${kind.toLowerCase()}`,
      name: FALLBACK_CATEGORY_NAME,
      kind,
      essential: false,
      defaultFlow: 'ONE_OFF',
      icon: FALLBACK_ICON,
      color: FALLBACK_COLOR,
      archived: false,
      sortOrder: categories.length,
    };
    categories.push(created);
    byId.set(created.id, created);
    fallbackCache.set(kind, created);
    fix('CREATED_FALLBACK_CATEGORY', path, `Создана категория «${FALLBACK_CATEGORY_NAME}» (${kind})`);
    return created;
  };

  // ---- переменные операции ---------------------------------------------
  const expenses: Expense[] = [];
  expensesRaw.forEach((raw, i) => {
    const path = `expenses[${i}]`;
    if (!isRecord(raw)) {
      fail('INVALID_ENTITY', path, 'Операция не является объектом');
      return;
    }
    const id = raw['id'];
    if (typeof id !== 'string' || id === '') {
      fail('INVALID_ENTITY', path, 'У операции нет идентификатора');
      return;
    }
    const date = raw['date'];
    if (!isDateStr(date)) {
      fail('INVALID_DATE', `${path}.date`, `Дата операции нечитаема: ${String(date)}`);
      return;
    }
    const amount = raw['amount'];
    if (!checkPositiveMoney(amount, `${path}.amount`, fail)) return;

    // Битая ссылка на категорию — чинимая проблема: операция уходит в «Прочее» (4.7, К5)
    let categoryId = typeof raw['categoryId'] === 'string' ? raw['categoryId'] : '';
    let category = byId.get(categoryId);
    if (!category) {
      // Направление по исчезнувшей категории не восстановить, берётся EXPENSE
      category = fallbackCategory('EXPENSE', `${path}.categoryId`);
      fix('ORPHAN_CATEGORY_REF', `${path}.categoryId`, `Операция перенесена в «${category.name}»`);
      categoryId = category.id;
    }

    const expense: Expense = { id, date, amount, categoryId, createdAt: '' };

    const flow = raw['flow'];
    if (flow !== undefined && flow !== null) {
      if (!isFlow(flow)) {
        fix('DROPPED_FLOW', `${path}.flow`, `Вид потока нечитаем (${String(flow)}), берётся из категории`);
      } else if (category.kind === 'INCOME') {
        // У доходов поток не определён и в расчётах не используется (1.3, инвариант 6)
        fix('DROPPED_FLOW', `${path}.flow`, 'У дохода поток не определён, поле убрано');
      } else {
        expense.flow = flow;
      }
    }

    const note = raw['note'];
    if (typeof note === 'string' && note !== '') {
      if (note.length > MAX_NOTE) {
        fix('TRUNCATED_TEXT', `${path}.note`, `Заметка обрезана до ${MAX_NOTE} символов`);
        expense.note = note.slice(0, MAX_NOTE);
      } else {
        expense.note = note;
      }
    }

    const createdAt = raw['createdAt'];
    if (typeof createdAt === 'string' && createdAt !== '') {
      expense.createdAt = createdAt;
    } else {
      // createdAt — только tie-breaker сортировки, на суммы не влияет
      fix('MISSING_CREATED_AT', `${path}.createdAt`, 'Нет метки создания, операция сортируется первой в своём дне');
    }

    expenses.push(expense);
  });

  // ---- постоянные позиции ----------------------------------------------
  const fixedItems: FixedItem[] = [];
  fixedItemsRaw.forEach((raw, i) => {
    const path = `fixedItems[${i}]`;
    if (!isRecord(raw)) {
      fail('INVALID_ENTITY', path, 'Постоянная позиция не является объектом');
      return;
    }
    const id = raw['id'];
    if (typeof id !== 'string' || id === '') {
      fail('INVALID_ENTITY', path, 'У постоянной позиции нет идентификатора');
      return;
    }
    const rawTitle = raw['title'];
    if (typeof rawTitle !== 'string') {
      fail('INVALID_ENTITY', `${path}.title`, 'Название позиции не строка');
      return;
    }
    const title = rawTitle.trim();
    if (title !== rawTitle) fix('TRIMMED_TEXT', `${path}.title`, `Убраны пробелы по краям: «${rawTitle}»`);
    if (title === '') {
      fail('EMPTY_TEXT', `${path}.title`, 'Пустое название постоянной позиции');
      return;
    }
    let kind = raw['kind'];
    if (!isKind(kind)) {
      fail('INVALID_KIND', `${path}.kind`, `Направление позиции нечитаемо: ${String(kind)}`);
      return;
    }
    const mode = raw['mode'];
    if (mode !== 'MONTHLY' && mode !== 'SPREAD') {
      fail('INVALID_MODE', `${path}.mode`, `Режим позиции нечитаем: ${String(mode)}`);
      return;
    }

    let categoryId = typeof raw['categoryId'] === 'string' ? raw['categoryId'] : '';
    let category = byId.get(categoryId);
    if (!category) {
      category = fallbackCategory(kind, `${path}.categoryId`);
      fix('ORPHAN_CATEGORY_REF', `${path}.categoryId`, `Позиция перенесена в «${category.name}»`);
      categoryId = category.id;
    }
    if (category.kind !== kind) {
      // Источник правды о направлении — категория (1.3, инвариант 2)
      fix('FIXED_KIND_FROM_CATEGORY', `${path}.kind`, `Направление взято из категории: ${category.kind}`);
      kind = category.kind;
    }

    const base = { id, title, kind, categoryId } as {
      id: string;
      title: string;
      kind: Kind;
      categoryId: string;
      endMonth?: string;
      note?: string;
    };

    const note = raw['note'];
    if (typeof note === 'string' && note !== '') {
      if (note.length > MAX_NOTE) {
        fix('TRUNCATED_TEXT', `${path}.note`, `Заметка обрезана до ${MAX_NOTE} символов`);
        base.note = note.slice(0, MAX_NOTE);
      } else {
        base.note = note;
      }
    }

    let item: FixedItem;
    if (mode === 'MONTHLY') {
      const periods = normalizeAmountPeriods(raw['amounts'], `${path}.amounts`, fix, fail);
      if (!periods) return;
      item = { ...base, mode: 'MONTHLY', amounts: periods };
    } else {
      const periods = normalizeSpreadPeriods(raw['spreads'], `${path}.spreads`, fix, fail);
      if (!periods) return;
      item = { ...base, mode: 'SPREAD', spreads: periods };
    }

    const endMonth = raw['endMonth'];
    if (endMonth !== undefined && endMonth !== null) {
      if (!isMonthKey(endMonth)) {
        fail('INVALID_MONTH', `${path}.endMonth`, `Месяц окончания нечитаем: ${String(endMonth)}`);
        return;
      }
      const first = firstFromMonth(item);
      if (compareMonth(endMonth, first) < 0) {
        // endMonth раньше начала — позиция действует ровно один месяц
        fix('CLAMPED_END_MONTH', `${path}.endMonth`, `Месяц окончания подтянут к началу: ${first}`);
        item.endMonth = first;
      } else {
        item.endMonth = endMonth;
      }
    }

    fixedItems.push(item);
  });

  const fixedById = new Map(fixedItems.map((f) => [f.id, f]));

  // ---- оверрайды --------------------------------------------------------
  const overrideByKey = new Map<string, MonthOverride>();
  overridesRaw.forEach((raw, i) => {
    const path = `overrides[${i}]`;
    if (!isRecord(raw)) {
      fail('INVALID_ENTITY', path, 'Оверрайд не является объектом');
      return;
    }
    const month = raw['month'];
    if (!isMonthKey(month)) {
      fail('INVALID_MONTH', `${path}.month`, `Месяц оверрайда нечитаем: ${String(month)}`);
      return;
    }
    const fixedItemId = raw['fixedItemId'];
    if (typeof fixedItemId !== 'string' || fixedItemId === '') {
      fail('INVALID_ENTITY', `${path}.fixedItemId`, 'Оверрайд без ссылки на позицию');
      return;
    }
    if (!fixedById.has(fixedItemId)) {
      // Позиции нет — оверрайд бессмыслен и ничего не теряет
      fix('DROPPED_ORPHAN_OVERRIDE', path, `Оверрайд без позиции ${fixedItemId} выброшен`);
      return;
    }
    const amount = raw['amount'];
    if (amount !== null && !checkPositiveMoney(amount, `${path}.amount`, fail)) return;

    const key = `${month}:${fixedItemId}`;
    if (overrideByKey.has(key)) {
      // Дубль пары (месяц, позиция) — берётся последний (4.7)
      fix('DEDUPED_OVERRIDE', path, `Дубль оверрайда ${key}, взят последний`);
    }
    overrideByKey.set(key, { month, fixedItemId, amount: amount as Money | null });
  });

  // ---- цели-накопления --------------------------------------------------
  const goals: SavingsGoal[] = [];
  goalsRaw.forEach((raw, i) => {
    const path = `goals[${i}]`;
    if (!isRecord(raw)) {
      fail('INVALID_ENTITY', path, 'Цель не является объектом');
      return;
    }
    const id = raw['id'];
    if (typeof id !== 'string' || id === '') {
      fail('INVALID_ENTITY', path, 'У цели нет идентификатора');
      return;
    }
    const rawTitle = raw['title'];
    if (typeof rawTitle !== 'string') {
      fail('INVALID_ENTITY', `${path}.title`, 'Название цели не строка');
      return;
    }
    const title = rawTitle.trim();
    if (title !== rawTitle) fix('TRIMMED_TEXT', `${path}.title`, `Убраны пробелы по краям: «${rawTitle}»`);
    if (title === '') {
      fail('EMPTY_TEXT', `${path}.title`, 'Пустое название цели');
      return;
    }
    const targetAmount = raw['targetAmount'];
    if (!checkPositiveMoney(targetAmount, `${path}.targetAmount`, fail)) return;

    const createdAt = typeof raw['createdAt'] === 'string' ? raw['createdAt'] : '';
    const contributions: Contribution[] = [];
    const contributionsRaw = Array.isArray(raw['contributions']) ? raw['contributions'] : [];
    if (!Array.isArray(raw['contributions'])) {
      fix('MISSING_ARRAY', `${path}.contributions`, 'Нет списка взносов, подставлен пустой');
    }
    let broken = false;
    contributionsRaw.forEach((c, j) => {
      const cPath = `${path}.contributions[${j}]`;
      if (!isRecord(c)) {
        fail('INVALID_ENTITY', cPath, 'Взнос не является объектом');
        broken = true;
        return;
      }
      const cId = c['id'];
      if (typeof cId !== 'string' || cId === '') {
        fail('INVALID_ENTITY', cPath, 'У взноса нет идентификатора');
        broken = true;
        return;
      }
      const month = c['month'];
      if (!isMonthKey(month)) {
        fail('INVALID_MONTH', `${cPath}.month`, `Месяц взноса нечитаем: ${String(month)}`);
        broken = true;
        return;
      }
      if (!checkPositiveMoney(c['amount'], `${cPath}.amount`, fail)) {
        broken = true;
        return;
      }
      const contribution: Contribution = { id: cId, month, amount: c['amount'] as Money };
      const cNote = c['note'];
      if (typeof cNote === 'string' && cNote !== '') {
        contribution.note = cNote.length > MAX_NOTE ? cNote.slice(0, MAX_NOTE) : cNote;
        if (cNote.length > MAX_NOTE) fix('TRUNCATED_TEXT', `${cPath}.note`, 'Заметка взноса обрезана');
      }
      contributions.push(contribution);
    });
    if (broken) return;

    const goal: SavingsGoal = {
      id,
      title,
      targetAmount: targetAmount as Money,
      contributions,
      archived: takeBoolean(raw, 'archived', false, path, fix),
      createdAt,
    };

    const deadline = raw['deadline'];
    if (deadline !== undefined && deadline !== null) {
      if (!isMonthKey(deadline)) {
        fail('INVALID_MONTH', `${path}.deadline`, `Срок цели нечитаем: ${String(deadline)}`);
        return;
      }
      const createdMonth = monthKeyOfIso(createdAt);
      if (createdMonth && compareMonth(deadline, createdMonth) < 0) {
        // Срок раньше создания — подтягивается к месяцу создания, цель считается просроченной
        fix('CLAMPED_DEADLINE', `${path}.deadline`, `Срок подтянут к месяцу создания: ${createdMonth}`);
        goal.deadline = createdMonth;
      } else {
        goal.deadline = deadline;
      }
    }

    goals.push(goal);
  });

  // ---- настройки --------------------------------------------------------
  const settingsRaw = doc['settings'];
  let settings: Settings | null = null;
  if (!isRecord(settingsRaw)) {
    fail('SETTINGS_INVALID', 'settings', 'Нет блока настроек');
  } else {
    const firstMonth = settingsRaw['firstMonth'];
    if (!isMonthKey(firstMonth)) {
      fail('SETTINGS_INVALID', 'settings.firstMonth', `Первый месяц учёта нечитаем: ${String(firstMonth)}`);
    } else {
      const startingBalance = settingsRaw['startingBalance'];
      if (!isMoney(startingBalance)) {
        fail(
          'FRACTIONAL_AMOUNT',
          'settings.startingBalance',
          `Стартовая сумма не целое число копеек: ${String(startingBalance)}`,
        );
      } else {
        settings = {
          firstMonth,
          startingBalance,
          targets: normalizeTargets(settingsRaw['targets'], 'settings.targets', fix, fail),
          forecastMinDay: takeBoundedInt(
            settingsRaw,
            'forecastMinDay',
            DEFAULT_FORECAST_MIN_DAY,
            1,
            31,
            'settings',
            fix,
          ),
          oneOffWindow: takeBoundedInt(settingsRaw, 'oneOffWindow', DEFAULT_ONE_OFF_WINDOW, 1, 120, 'settings', fix),
          createdAt: typeof settingsRaw['createdAt'] === 'string' ? settingsRaw['createdAt'] : '',
        };
      }
    }
  }

  if (fatal.length > 0 || settings === null) {
    return { doc: null, fixed, fatal };
  }

  categories.sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    doc: {
      schemaVersion: schemaVersion as number,
      categories,
      expenses,
      fixedItems,
      overrides: [...overrideByKey.values()],
      goals,
      settings,
    },
    fixed,
    fatal,
  };
}

// ------------------------------------------------------------------ helpers

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKind(value: unknown): value is Kind {
  return value === 'INCOME' || value === 'EXPENSE';
}

function isFlow(value: unknown): value is Flow {
  return value === 'ROUTINE' || value === 'ONE_OFF';
}

function checkPositiveMoney(
  value: unknown,
  path: string,
  fail: (code: FatalCode, path: string, message: string) => void,
): value is Money {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('FRACTIONAL_AMOUNT', path, `Сумма нечитаема: ${String(value)}`);
    return false;
  }
  if (!Number.isInteger(value)) {
    fail('FRACTIONAL_AMOUNT', path, `Дробная сумма: ${value}`);
    return false;
  }
  if (value <= 0) {
    fail('NON_POSITIVE_AMOUNT', path, `Сумма не положительна: ${value}`);
    return false;
  }
  return true;
}

function takeArray(
  doc: Record<string, unknown>,
  key: string,
  fix: (code: FixCode, path: string, message: string) => void,
): unknown[] {
  const value = doc[key];
  if (Array.isArray(value)) return value;
  fix('MISSING_ARRAY', key, `Нет списка ${key}, подставлен пустой`);
  return [];
}

function takeBoolean(
  raw: Record<string, unknown>,
  key: string,
  fallback: boolean,
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
): boolean {
  const value = raw[key];
  if (typeof value === 'boolean') return value;
  fix('CATEGORY_FIELD_DEFAULTED', `${path}.${key}`, `Поле ${key} подставлено: ${fallback}`);
  return fallback;
}

function takeString(
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
): string {
  const value = raw[key];
  if (typeof value === 'string' && value !== '') return value;
  fix('CATEGORY_FIELD_DEFAULTED', `${path}.${key}`, `Поле ${key} подставлено: ${fallback}`);
  return fallback;
}

function takeNumber(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
): number {
  const value = raw[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  fix('CATEGORY_FIELD_DEFAULTED', `${path}.${key}`, `Поле ${key} подставлено: ${fallback}`);
  return fallback;
}

function takeFlow(
  raw: Record<string, unknown>,
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
): Flow {
  const value = raw['defaultFlow'];
  if (isFlow(value)) return value;
  // Тот же дефолт, что и в миграции 2→3 (4.10, К3)
  fix('CATEGORY_FIELD_DEFAULTED', `${path}.defaultFlow`, 'Вид потока по умолчанию подставлен: ROUTINE');
  return 'ROUTINE';
}

function takeBoundedInt(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
): number {
  const value = raw[key];
  if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) return value;
  fix('SETTINGS_DEFAULTED', `${path}.${key}`, `Настройка ${key} вне диапазона, взят дефолт ${fallback}`);
  return fallback;
}

function firstFromMonth(item: FixedItem): MonthKey {
  return item.mode === 'MONTHLY' ? item.amounts[0]!.fromMonth : item.spreads[0]!.fromMonth;
}

/** Общая часть: непустой список, уникальные fromMonth, сортировка по возрастанию. */
function normalizeAmountPeriods(
  raw: unknown,
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
  fail: (code: FatalCode, path: string, message: string) => void,
): AmountPeriod[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail('EMPTY_PERIODS', path, 'Пустой список сумм у постоянной позиции');
    return null;
  }
  const byMonth = new Map<MonthKey, AmountPeriod>();
  let broken = false;
  raw.forEach((entry, i) => {
    const p = `${path}[${i}]`;
    if (!isRecord(entry)) {
      fail('INVALID_ENTITY', p, 'Запись суммы не является объектом');
      broken = true;
      return;
    }
    const fromMonth = entry['fromMonth'];
    if (!isMonthKey(fromMonth)) {
      fail('INVALID_MONTH', `${p}.fromMonth`, `Месяц записи нечитаем: ${String(fromMonth)}`);
      broken = true;
      return;
    }
    if (!checkPositiveMoney(entry['amount'], `${p}.amount`, fail)) {
      broken = true;
      return;
    }
    if (byMonth.has(fromMonth)) fix('DEDUPED_PERIODS', p, `Дубль записи за ${fromMonth}, взята последняя`);
    byMonth.set(fromMonth, { fromMonth, amount: entry['amount'] as Money });
  });
  if (broken) return null;
  return sortPeriods([...byMonth.values()], path, fix);
}

function normalizeSpreadPeriods(
  raw: unknown,
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
  fail: (code: FatalCode, path: string, message: string) => void,
): SpreadPeriod[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail('EMPTY_PERIODS', path, 'Пустой список периодов у размазанной позиции');
    return null;
  }
  const byMonth = new Map<MonthKey, SpreadPeriod>();
  let broken = false;
  raw.forEach((entry, i) => {
    const p = `${path}[${i}]`;
    if (!isRecord(entry)) {
      fail('INVALID_ENTITY', p, 'Период не является объектом');
      broken = true;
      return;
    }
    const fromMonth = entry['fromMonth'];
    if (!isMonthKey(fromMonth)) {
      fail('INVALID_MONTH', `${p}.fromMonth`, `Месяц периода нечитаем: ${String(fromMonth)}`);
      broken = true;
      return;
    }
    if (!checkPositiveMoney(entry['totalAmount'], `${p}.totalAmount`, fail)) {
      broken = true;
      return;
    }
    const months = entry['months'];
    if (typeof months !== 'number' || !Number.isInteger(months) || months < 2) {
      fail('INVALID_SPREAD_MONTHS', `${p}.months`, `Длина цикла должна быть целой и >= 2, получено ${String(months)}`);
      broken = true;
      return;
    }
    const period: SpreadPeriod = { fromMonth, totalAmount: entry['totalAmount'] as Money, months };

    const payMonth = entry['payMonth'];
    if (payMonth !== undefined && payMonth !== null) {
      if (isMonthKey(payMonth)) period.payMonth = payMonth;
      else fix('DROPPED_PAY_MONTH', `${p}.payMonth`, `Месяц списания нечитаем (${String(payMonth)}), взят fromMonth`);
    }
    const payDay = entry['payDay'];
    if (payDay !== undefined && payDay !== null) {
      if (typeof payDay === 'number' && Number.isInteger(payDay) && payDay >= 1 && payDay <= 31) {
        period.payDay = payDay;
      } else {
        // payDay нужен только для напоминания, в расчётах не участвует
        fix('DROPPED_PAY_DAY', `${p}.payDay`, `День списания вне 1..31 (${String(payDay)}), убран`);
      }
    }

    if (byMonth.has(fromMonth)) fix('DEDUPED_PERIODS', p, `Дубль периода за ${fromMonth}, взят последний`);
    byMonth.set(fromMonth, period);
  });
  if (broken) return null;
  return sortPeriods([...byMonth.values()], path, fix);
}

function sortPeriods<T extends { fromMonth: MonthKey }>(
  periods: T[],
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
): T[] {
  const sorted = [...periods].sort((a, b) => compareMonth(a.fromMonth, b.fromMonth));
  const wasSorted = periods.every((p, i) => p.fromMonth === sorted[i]!.fromMonth);
  if (!wasSorted) fix('SORTED_PERIODS', path, 'Список сумм был не отсортирован, порядок восстановлен');
  return sorted;
}

function normalizeTargets(
  raw: unknown,
  path: string,
  fix: (code: FixCode, path: string, message: string) => void,
  fail: (code: FatalCode, path: string, message: string) => void,
): MonthlyTarget[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) fix('MISSING_ARRAY', path, 'Список целей по накоплению нечитаем, подставлен пустой');
    return [];
  }
  const byMonth = new Map<MonthKey, MonthlyTarget>();
  raw.forEach((entry, i) => {
    const p = `${path}[${i}]`;
    if (!isRecord(entry)) {
      fail('INVALID_ENTITY', p, 'Запись цели не является объектом');
      return;
    }
    const fromMonth = entry['fromMonth'];
    if (!isMonthKey(fromMonth)) {
      fail('INVALID_MONTH', `${p}.fromMonth`, `Месяц цели нечитаем: ${String(fromMonth)}`);
      return;
    }
    if (!checkPositiveMoney(entry['amount'], `${p}.amount`, fail)) return;
    if (byMonth.has(fromMonth)) fix('DEDUPED_TARGETS', p, `Дубль цели за ${fromMonth}, взята последняя`);
    byMonth.set(fromMonth, { fromMonth, amount: entry['amount'] as Money });
  });
  const list = [...byMonth.values()];
  const sorted = [...list].sort((a, b) => compareMonth(a.fromMonth, b.fromMonth));
  if (!list.every((t, i) => t.fromMonth === sorted[i]!.fromMonth)) {
    fix('SORTED_TARGETS', path, 'Цели по накоплению были не отсортированы, порядок восстановлен');
  }
  return sorted;
}
