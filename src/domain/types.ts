/**
 * Типы домена. Часть 1 спецификации.
 *
 * Деньги — целые копейки. Даты — строки. Объекты Date в документ не попадают.
 */

/** Целое число копеек. 1500 ₽ === 150000. Знака нет: направление задаёт kind. */
export type Money = number;

/** "YYYY-MM" — единица учёта фиксированного блока. */
export type MonthKey = string;

/** "YYYY-MM-DD" — дата переменной операции. */
export type DateStr = string;

/** Направление. Источник правды — категория, у операции своего поля нет (1.3). */
export type Kind = 'INCOME' | 'EXPENSE';

/**
 * Вид переменной траты.
 * ROUTINE экстраполируется на месяц, ONE_OFF — нет (1.2).
 */
export type Flow = 'ROUTINE' | 'ONE_OFF';

/** Версия схемы документа. Растёт на единицу, см. 4.6. */
export const CURRENT_SCHEMA_VERSION = 4;

/** Ставка НДФЛ по умолчанию. Подставляется в переключатель, но ничего не включает. */
export const DEFAULT_TAX_PERCENT = 13;

// ---------------------------------------------------------------- 1.2

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  /** обязательная vs дискреционная */
  essential: boolean;
  /** только для EXPENSE */
  defaultFlow: Flow;
  /** emoji */
  icon: string;
  /** hex */
  color: string;
  archived: boolean;
  sortOrder: number;
}

// ---------------------------------------------------------------- 1.3

/** Переменная операция: разовая трата или разовый доход, всегда с датой. */
export interface Expense {
  id: string;
  date: DateStr;
  /** > 0 */
  amount: Money;
  categoryId: string;
  /** переопределяет defaultFlow категории */
  flow?: Flow;
  /** ≤ 200 символов */
  note?: string;
  /** ISO 8601 UTC, только tie-breaker при сортировке */
  createdAt: string;
}

// ---------------------------------------------------------------- 1.4

export interface FixedItemBase {
  id: string;
  title: string;
  kind: Kind;
  categoryId: string;
  /** последний месяц действия включительно */
  endMonth?: MonthKey;
  note?: string;
  /**
   * Удержание налога с этой позиции, целые проценты 1..99.
   * Поля нет — вычета нет: сумма позиции и есть то, что приходит.
   * Применимо только при kind === 'INCOME'.
   */
  taxPercent?: number;
}

/** Сумма, действующая с месяца fromMonth и до следующей записи. */
export interface AmountPeriod {
  fromMonth: MonthKey;
  /** > 0 */
  amount: Money;
}

/** Годовой или сезонный платёж, размазанный по months месяцам. */
export interface SpreadPeriod {
  /** первый месяц цикла */
  fromMonth: MonthKey;
  /** > 0, сумма платежа целиком */
  totalAmount: Money;
  /** >= 2, на сколько месяцев размазывается */
  months: number;
  /** месяц фактического списания, по умолчанию fromMonth. Только для календаря 2.11 */
  payMonth?: MonthKey;
  /** 1..31, только для напоминания. В расчётах не участвует */
  payDay?: number;
}

export type FixedItemMonthly = FixedItemBase & { mode: 'MONTHLY'; amounts: AmountPeriod[] };
export type FixedItemSpread = FixedItemBase & { mode: 'SPREAD'; spreads: SpreadPeriod[] };

/** Постоянная позиция. Даты не имеет, живёт по месяцам. */
export type FixedItem = FixedItemMonthly | FixedItemSpread;

// ---------------------------------------------------------------- 1.5

/** Разовое отклонение постоянной позиции в одном месяце. */
export interface MonthOverride {
  month: MonthKey;
  fixedItemId: string;
  /** null = позиция пропущена в этом месяце */
  amount: Money | null;
}

// ---------------------------------------------------------------- 1.6

/** Цель по накоплению в месяц. Версионная: прошлое не переписывается. */
export interface MonthlyTarget {
  fromMonth: MonthKey;
  /** > 0 */
  amount: Money;
}

// ---------------------------------------------------------------- 1.7

/** Взнос в цель-накопление. Не трата: net не уменьшает (1.7). */
export interface Contribution {
  id: string;
  month: MonthKey;
  /** > 0 */
  amount: Money;
  note?: string;
}

/** Цель-накопление: накопить конкретную сумму. */
export interface SavingsGoal {
  id: string;
  title: string;
  /** > 0 */
  targetAmount: Money;
  deadline?: MonthKey;
  contributions: Contribution[];
  archived: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------- 1.8

export interface Settings {
  /** с какого месяца ведётся учёт */
  firstMonth: MonthKey;
  /** сколько было накоплено к firstMonth, может быть 0 */
  startingBalance: Money;
  /** версионная цель по накоплению */
  targets: MonthlyTarget[];
  /** с какого дня месяца показывать прогноз, дефолт 5 */
  forecastMinDay: number;
  /** окно среднего по разовым в месяцах, дефолт 6 */
  oneOffWindow: number;
  createdAt: string;
}

export interface BudgetDocument {
  schemaVersion: number;
  categories: Category[];
  expenses: Expense[];
  fixedItems: FixedItem[];
  overrides: MonthOverride[];
  goals: SavingsGoal[];
  settings: Settings;
}

/** Дефолты настроек, названные в 1.8. */
export const DEFAULT_FORECAST_MIN_DAY = 5;
export const DEFAULT_ONE_OFF_WINDOW = 6;
