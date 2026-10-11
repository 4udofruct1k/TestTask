/**
 * Расход энергии за день и анализ по дням. HOUSEHOLD_SPEC, раздел 10.
 *
 * Расход = основной обмен + день (работа сидя, дом, дорога)
 *        + переваривание еды + тренировка, если отмечена выполненной.
 *
 * Основной обмен — по формуле Кэтча — Макардла от сухой массы:
 * 370 + 21,6 × (вес × (1 − жир)). Ей нужны только вес и процент жира,
 * без роста и возраста, и она точнее для тренированных.
 *
 * Работа головой с 11 до 20 почти не добавляет расхода: мозг тратит
 * примерно одинаково и в покое, и над задачей. Поэтому рабочий день
 * учтён как сидячий — четверть основного обмена сверху. Подходы
 * упражнений внутри рабочего дня — это и есть тренировка дня.
 *
 * Всё это оценка с точностью около ±10%. Сверка с весами раз в неделю
 * показывает, насколько реальный расход отличается от расчёта.
 */

import { addDays, weekKeyOf, type DateStr } from '../household/days';
import { kcalOf, type Plan } from '../household/plan';
import type { Person } from '../household/types';
import type { Measurement, PersonData } from './doc';
import { plannedKcal } from './training';

/** Ккал в килограмме жировой ткани — стандартная оценка. */
export const KCAL_PER_KG = 7700;
/** Сидячий рабочий день, дом, дорога: доля основного обмена. */
export const DESK_DAY = 0.25;
/** Переваривание еды: доля съеденного. */
export const DIGESTION = 0.1;
/** Сверка с весами — не раньше, чем через столько дней между взвешиваниями. */
export const CALIBRATION_MIN_DAYS = 6;

export const leanMass = (weight: number, fat: number): number => weight * (1 - fat / 100);
export const fatMass = (weight: number, fat: number): number => (weight * fat) / 100;

/** Основной обмен по Кэтчу — Макардлу, ккал в сутки. */
export const basalRate = (weight: number, fat: number): number => 370 + 21.6 * leanMass(weight, fat);

export interface Body {
  weight: number;
  fat: number;
  /** Даты замеров, из которых взяты вес и жир */
  weightDate: DateStr;
  fatDate: DateStr;
}

/**
 * Вес и жир на дату: каждое — из последнего замера не позже даты, где оно
 * есть. Дни до первого замера считаются по первому: вес за несколько дней
 * меняется мало. null — веса или жира не вписано ни разу.
 */
export function bodyOn(measurements: Measurement[], date: DateStr): Body | null {
  const pick = (field: 'weight' | 'fat'): { value: number; date: DateStr } | null => {
    const withField = measurements.filter((m) => m[field] !== undefined);
    if (withField.length === 0) return null;
    const before = withField.filter((m) => m.date <= date);
    const m = before.length > 0 ? before[before.length - 1]! : withField[0]!;
    return { value: m[field]!, date: m.date };
  };
  const weight = pick('weight');
  const fat = pick('fat');
  if (!weight || !fat) return null;
  return { weight: weight.value, fat: fat.value, weightDate: weight.date, fatDate: fat.date };
}

export interface DayEnergy {
  intake: number;
  basal: number;
  desk: number;
  digestion: number;
  /** Тренировка, которая вошла в расход */
  training: number;
  total: number;
  /** Съедено минус расход: минус — дефицит */
  balance: number;
}

/** Части округляются до ккал, итог — сумма показанных частей: на экране всё сходится. */
export function dayEnergy(body: Body, intake: number, training: number): DayEnergy {
  const exact = basalRate(body.weight, body.fat);
  const basal = Math.round(exact);
  const desk = Math.round(exact * DESK_DAY);
  const digestion = Math.round(intake * DIGESTION);
  const counted = Math.round(training);
  const total = basal + desk + digestion + counted;
  const eaten = Math.round(intake);
  return { intake: eaten, basal, desk, digestion, training: counted, total, balance: eaten - total };
}

export type TrainingState = 'done' | 'missed' | 'pending' | 'planned' | 'rest';

export interface DayRow {
  date: DateStr;
  /** done — отмечена; missed — день прошёл без отметки; pending — сегодня, ещё не отмечена;
      planned — будущий день, в расход взята по плану; rest — тренировки нет */
  training: TrainingState;
  /** Расход тренировки по плану или своему значению */
  plannedTraining: number;
  energy: DayEnergy | null;
}

/**
 * День для анализа. До сегодняшнего включительно тренировка входит
 * в расход, только если отмечена. Будущие дни — прогноз «если всё по плану».
 */
export function dayRow(plan: Plan, person: Person, data: PersonData, date: DateStr, today: DateStr): DayRow {
  const key = weekKeyOf(date);
  const planned = plannedKcal(person, key, data.kcal);
  const done = data.done[date];
  let training: TrainingState;
  let counted: number;
  if (done !== undefined) {
    training = 'done';
    counted = done;
  } else if (planned === 0) {
    training = 'rest';
    counted = 0;
  } else if (date > today) {
    training = 'planned';
    counted = planned;
  } else {
    training = date === today ? 'pending' : 'missed';
    counted = 0;
  }
  const body = bodyOn(data.measurements, date);
  return {
    date,
    training,
    plannedTraining: planned,
    energy: body ? dayEnergy(body, kcalOf(plan, person, key), counted) : null,
  };
}

export function dayRows(plan: Plan, person: Person, data: PersonData, dates: DateStr[], today: DateStr): DayRow[] {
  return dates.map((d) => dayRow(plan, person, data, d, today));
}

/** Сумма баланса по дням, где он посчитан. */
export const totalBalance = (rows: DayRow[]): number => rows.reduce((s, r) => s + (r.energy?.balance ?? 0), 0);

export interface Calibration {
  from: DateStr;
  to: DateStr;
  days: number;
  /** Изменение веса по расчёту, кг */
  predicted: number;
  /** По весам, кг */
  actual: number;
  /** На сколько реальный расход больше расчётного, ккал в день. Минус — меньше */
  gapPerDay: number;
}

/**
 * Сверка расчёта с весами: последнее взвешивание против самого позднего,
 * что было хотя бы на CALIBRATION_MIN_DAYS раньше. Сколько по расчёту должно
 * было уйти и сколько ушло на самом деле — разница, делённая на дни, это
 * поправка к расходу. Ели не по рациону — разница попадёт сюда же.
 */
export function calibrate(plan: Plan, person: Person, data: PersonData, today: DateStr): Calibration | null {
  const weighed = data.measurements.filter((m) => m.weight !== undefined);
  const last = weighed[weighed.length - 1];
  if (!last) return null;
  const earlier = weighed.filter((m) => m.date <= addDays(last.date, -CALIBRATION_MIN_DAYS));
  const first = earlier[earlier.length - 1];
  if (!first) return null;

  const dates: DateStr[] = [];
  for (let d = first.date; d < last.date; d = addDays(d, 1)) dates.push(d);
  const rows = dayRows(plan, person, data, dates, today);
  if (rows.some((r) => r.energy === null)) return null;

  const predicted = totalBalance(rows) / KCAL_PER_KG;
  const actual = last.weight! - first.weight!;
  return {
    from: first.date,
    to: last.date,
    days: dates.length,
    predicted,
    actual,
    gapPerDay: Math.round(((predicted - actual) * KCAL_PER_KG) / dates.length),
  };
}
