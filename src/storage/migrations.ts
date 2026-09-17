/**
 * Цепочка миграций. Раздел 4.6.
 *
 * schemaVersion растёт на единицу, миграция — чистая функция (doc) => doc.
 * Миграции никогда не удаляются из кода: файл двухлетней давности обязан открыться.
 *
 * Версии 1 и 2 в природе не выпускались (4.6), но цепочка должна существовать
 * с самого начала — иначе её никто не заведёт потом. Формы этих версий
 * восстановлены по таблице истории версий и описаны ниже.
 */

import { CURRENT_SCHEMA_VERSION, DEFAULT_FORECAST_MIN_DAY, DEFAULT_ONE_OFF_WINDOW } from '../domain/types';

type Raw = Record<string, unknown>;

/** Миграция из версии N в N+1. */
export type Migration = (doc: Raw) => Raw;

export const MIGRATIONS: Record<number, Migration> = {
  1: migrate1to2,
  2: migrate2to3,
  3: migrate3to4,
};

export type MigrateResult =
  | { ok: true; doc: Raw; applied: number[] }
  | { ok: false; reason: 'FROM_FUTURE' | 'NO_PATH'; fileVersion: number; message: string };

export function migrate(
  doc: unknown,
  supported: number = CURRENT_SCHEMA_VERSION,
): MigrateResult {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return { ok: false, reason: 'NO_PATH', fileVersion: 0, message: 'В файле не документ' };
  }

  const raw = doc as Raw;
  const version = raw['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'NO_PATH', fileVersion: 0, message: 'Версия схемы нечитаема' };
  }

  // Попытка прочитать будущую схему как текущую — самый надёжный способ потерять данные
  if (version > supported) {
    return {
      ok: false,
      reason: 'FROM_FUTURE',
      fileVersion: version,
      message: `Файл версии ${version}, эта сборка понимает ${supported}. Обновите приложение`,
    };
  }

  let current = raw;
  const applied: number[] = [];
  for (let v = version; v < supported; v++) {
    const step = MIGRATIONS[v];
    if (!step) {
      return { ok: false, reason: 'NO_PATH', fileVersion: version, message: `Нет миграции ${v} → ${v + 1}` };
    }
    current = step(current);
    current['schemaVersion'] = v + 1;
    applied.push(v + 1);
  }

  return { ok: true, doc: current, applied };
}

/**
 * 1 → 2. Переход на месячный учёт.
 *
 * В первой модели повторяющиеся платежи имели дату внутри месяца
 * и требовали подтверждения. Обе вещи уходят: единица учёта — месяц,
 * дата внутри него на итог не влияет, а позиция засчитывается по факту
 * существования (1.0).
 */
function migrate1to2(doc: Raw): Raw {
  const settings = asRecord(doc['settings']);
  const firstMonth = typeof settings['firstMonth'] === 'string' ? settings['firstMonth'] : '1970-01';

  const recurring = asArray(doc['recurring']);
  const fixedItems = recurring.map((entry) => {
    const item = asRecord(entry);
    const fromMonth = typeof item['startMonth'] === 'string' ? item['startMonth'] : firstMonth;
    const out: Raw = {
      id: item['id'],
      title: item['title'],
      kind: item['kind'],
      categoryId: item['categoryId'],
      // Дата платежа внутри месяца выбрасывается вместе с переносом с выходных
      amounts: [{ fromMonth, amount: item['amount'] }],
    };
    if (typeof item['endMonth'] === 'string') out['endMonth'] = item['endMonth'];
    if (typeof item['note'] === 'string') out['note'] = item['note'];
    return out;
  });

  // Подтверждения плановых платежей больше нет: операция существует — значит считается
  const expenses = asArray(doc['expenses']).map((entry) => {
    const expense = { ...asRecord(entry) };
    delete expense['planned'];
    delete expense['confirmed'];
    return expense;
  });

  const next: Raw = { ...doc, expenses, fixedItems, overrides: asArray(doc['overrides']) };
  delete next['recurring'];
  return next;
}

/**
 * 2 → 3. Виды потока, режим SPREAD, цели, месячная цель.
 *
 * Суммы месяцев миграция не трогает: добавляются только поля,
 * от которых зависит разделение рутины и разовых.
 */
function migrate2to3(doc: Raw): Raw {
  const categories = asArray(doc['categories']).map((entry) => {
    const category = { ...asRecord(entry) };
    // Категории без вида потока получают ROUTINE (4.10, К3)
    if (category['defaultFlow'] !== 'ROUTINE' && category['defaultFlow'] !== 'ONE_OFF') {
      category['defaultFlow'] = 'ROUTINE';
    }
    return category;
  });

  const flowByCategory = new Map<string, string>();
  for (const category of categories) {
    if (typeof category['id'] === 'string') {
      flowByCategory.set(category['id'], String(category['defaultFlow']));
    }
  }

  // У всех операций проставляется flow из defaultFlow категории
  const expenses = asArray(doc['expenses']).map((entry) => {
    const expense = { ...asRecord(entry) };
    const categoryId = typeof expense['categoryId'] === 'string' ? expense['categoryId'] : '';
    const flow = flowByCategory.get(categoryId);
    if (flow !== undefined) expense['flow'] = flow;
    return expense;
  });

  // До версии 3 размазанных платежей не было — все позиции помесячные
  const fixedItems = asArray(doc['fixedItems']).map((entry) => {
    const item = { ...asRecord(entry) };
    if (item['mode'] !== 'MONTHLY' && item['mode'] !== 'SPREAD') item['mode'] = 'MONTHLY';
    return item;
  });

  const settings = { ...asRecord(doc['settings']) };
  if (!Array.isArray(settings['targets'])) settings['targets'] = [];
  if (typeof settings['forecastMinDay'] !== 'number') settings['forecastMinDay'] = DEFAULT_FORECAST_MIN_DAY;
  if (typeof settings['oneOffWindow'] !== 'number') settings['oneOffWindow'] = DEFAULT_ONE_OFF_WINDOW;

  return {
    ...doc,
    categories,
    expenses,
    fixedItems,
    overrides: asArray(doc['overrides']),
    goals: asArray(doc['goals']),
    settings,
  };
}

/**
 * 3 → 4. Необязательное удержание налога на позиции дохода.
 *
 * Преобразовывать нечего: поля taxPercent в старых документах нет,
 * а его отсутствие и означает «вычета нет». Миграция существует ради
 * версии: файл, написанный новой сборкой, старая открыть не должна —
 * иначе она молча покажет доход до удержания и соврёт на 13%.
 */
function migrate3to4(doc: Raw): Raw {
  return { ...doc };
}

function asRecord(value: unknown): Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
