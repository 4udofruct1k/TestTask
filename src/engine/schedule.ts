/**
 * Что из постоянного уже случилось, а что ещё впереди. Раздел 2.14.
 *
 * Месяц остаётся единицей учёта: суммы месяца от чисел не зависят и ни одна
 * величина Части 2 здесь не меняется. Расписание отвечает на другой вопрос —
 * зарплата за октябрь приходит 20 октября и 5 ноября, и первого числа она
 * ещё не пришла, хотя в бюджет месяца уже входит.
 *
 * Позиции без числа в расписание не попадают: выдумывать им дату нельзя,
 * поэтому они считаются отдельной величиной undated.
 */

import { compareMonth, daysInMonth, monthKeyOf } from '../domain/dates';
import type { BudgetDocument, DateStr, Kind, Money, MonthKey } from '../domain/types';
import { resolveFixed } from './fixed';

export interface FixedEvent {
  itemId: string;
  title: string;
  kind: Kind;
  categoryId: string;
  /** Сумма после удержания — та же, что идёт в расчёты месяца */
  amount: Money;
  /** Число месяца, подрезанное по его длине: 31-е в апреле это 30-е */
  day: number;
  date: DateStr;
  /** Дата уже наступила. Для прошедших месяцев верно всегда */
  done: boolean;
}

export interface SideProgress {
  /** Все позиции этого направления за месяц, с датами и без */
  total: Money;
  /** Уже случившееся по датам */
  done: Money;
  /** Ещё впереди по датам */
  ahead: Money;
  /** Позиции без числа: ни в done, ни в ahead */
  undated: Money;
}

export interface FixedProgress {
  month: MonthKey;
  income: SideProgress;
  expense: SideProgress;
  events: FixedEvent[];
  /** Ближайшее ненаступившее событие месяца */
  next: FixedEvent | null;
  /** Есть ли хоть одно число — показывать ли расписание вообще */
  hasDays: boolean;
}

/** События месяца по возрастанию числа. Только помесячные позиции с числом. */
export function monthSchedule(doc: BudgetDocument, month: MonthKey, today: DateStr): FixedEvent[] {
  const length = daysInMonth(month);
  const events: FixedEvent[] = [];

  for (const item of resolveFixed(doc, month)) {
    if (item.dueDay === undefined || item.isReserve) continue;
    // 31-е число в коротком месяце — последний день, а не несуществующая дата
    const day = Math.min(item.dueDay, length);
    const date = `${month}-${String(day).padStart(2, '0')}`;
    events.push({
      itemId: item.itemId,
      title: item.title,
      kind: item.kind,
      categoryId: item.categoryId,
      amount: item.amount,
      day,
      date,
      // Сравнение строк: обе в формате YYYY-MM-DD, порядок совпадает с датами
      done: date <= today,
    });
  }

  return events.sort((a, b) => a.day - b.day || a.title.localeCompare(b.title, 'ru-RU'));
}

export function fixedProgress(doc: BudgetDocument, month: MonthKey, today: DateStr): FixedProgress {
  const events = monthSchedule(doc, month, today);
  const past = compareMonth(month, monthKeyOf(today)) < 0;

  const income: SideProgress = { total: 0, done: 0, ahead: 0, undated: 0 };
  const expense: SideProgress = { total: 0, done: 0, ahead: 0, undated: 0 };
  const side = (kind: Kind): SideProgress => (kind === 'INCOME' ? income : expense);

  for (const item of resolveFixed(doc, month)) {
    const acc = side(item.kind);
    acc.total += item.amount;
    if (item.dueDay === undefined || item.isReserve) {
      // Закрытый месяц случился целиком, даже если чисел никто не проставлял
      if (past) acc.done += item.amount;
      else acc.undated += item.amount;
    }
  }

  for (const event of events) {
    const acc = side(event.kind);
    if (event.done) acc.done += event.amount;
    else acc.ahead += event.amount;
  }

  return {
    month,
    income,
    expense,
    events,
    next: events.find((event) => !event.done) ?? null,
    hasDays: events.length > 0,
  };
}
