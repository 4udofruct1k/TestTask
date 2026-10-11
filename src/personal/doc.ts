/**
 * Личные данные: отметки тренировок, свой расход по дням, вес и замеры.
 * HOUSEHOLD_SPEC, раздел 10.
 *
 * Как бюджет — у каждого свои и лежат только в его телефоне. Ключи по
 * людям нужны не для обмена, а чтобы смена «Чей это телефон» ничего
 * не перемешала.
 */

import { WEEK_KEYS, type DateStr, type WeekKey } from '../household/days';
import { PEOPLE, type Person } from '../household/types';

/** Замер одного дня. Любое поле можно не заполнять. */
export interface Measurement {
  date: DateStr;
  /** кг */
  weight?: number;
  /** процент жира */
  fat?: number;
  /** обхваты, см */
  waist?: number;
  chest?: number;
  hips?: number;
  bicep?: number;
  thigh?: number;
}

export type MeasureField = Exclude<keyof Measurement, 'date'>;

export const MEASURE_FIELDS: { key: MeasureField; label: string; unit: string; min: number; max: number }[] = [
  { key: 'weight', label: 'Вес', unit: 'кг', min: 30, max: 250 },
  { key: 'fat', label: 'Жир', unit: '%', min: 3, max: 60 },
  { key: 'waist', label: 'Талия', unit: 'см', min: 40, max: 200 },
  { key: 'chest', label: 'Грудь', unit: 'см', min: 50, max: 200 },
  { key: 'hips', label: 'Бёдра', unit: 'см', min: 50, max: 200 },
  { key: 'bicep', label: 'Бицепс', unit: 'см', min: 15, max: 70 },
  { key: 'thigh', label: 'Бедро', unit: 'см', min: 30, max: 100 },
];

export interface PersonData {
  /** Отмеченные тренировки: дата → сколько ккал ушло */
  done: Record<DateStr, number>;
  /** Свой расход тренировки по дням недели вместо оценки плана */
  kcal: Partial<Record<WeekKey, number>>;
  /** По возрастанию даты, одна запись на дату */
  measurements: Measurement[];
}

export const PERSONAL_FORMAT = 'personal-v1';

export interface PersonalDoc {
  format: typeof PERSONAL_FORMAT;
  people: Record<Person, PersonData>;
}

const emptyPerson = (): PersonData => ({ done: {}, kcal: {}, measurements: [] });

export function emptyPersonal(): PersonalDoc {
  return { format: PERSONAL_FORMAT, people: { max: emptyPerson(), ilvina: emptyPerson() } };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseMeasurement(raw: unknown): Measurement | null {
  if (!isObj(raw) || typeof raw['date'] !== 'string' || !DATE_RE.test(raw['date'])) return null;
  const m: Measurement = { date: raw['date'] };
  for (const f of MEASURE_FIELDS) {
    const v = raw[f.key];
    if (isNum(v) && v > 0) m[f.key] = v;
  }
  return m;
}

function parsePerson(raw: unknown): PersonData {
  const p = emptyPerson();
  if (!isObj(raw)) return p;
  if (isObj(raw['done'])) {
    for (const [date, v] of Object.entries(raw['done'])) if (DATE_RE.test(date) && isNum(v) && v >= 0) p.done[date] = v;
  }
  if (isObj(raw['kcal'])) {
    for (const key of WEEK_KEYS) {
      const v = raw['kcal'][key];
      if (isNum(v) && v >= 0) p.kcal[key] = v;
    }
  }
  if (Array.isArray(raw['measurements'])) {
    const byDate = new Map<DateStr, Measurement>();
    for (const m of raw['measurements'].map(parseMeasurement)) if (m) byDate.set(m.date, m);
    p.measurements = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return p;
}

/** Разбор файла. Непонятное поле пропускается, а не валит всё. null — не JSON или чужой формат. */
export function parsePersonal(text: string): PersonalDoc | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw['format'] !== PERSONAL_FORMAT) return null;
  const people = isObj(raw['people']) ? raw['people'] : {};
  const doc = emptyPersonal();
  for (const { id } of PEOPLE) doc.people[id] = parsePerson(people[id]);
  return doc;
}

// --------------------------------------------------------------- правки

const withPerson = (doc: PersonalDoc, person: Person, change: (p: PersonData) => PersonData): PersonalDoc => ({
  ...doc,
  people: { ...doc.people, [person]: change(doc.people[person]) },
});

/** Отметить тренировку дня выполненной (kcal) или снять отметку (null). */
export function markDone(doc: PersonalDoc, person: Person, date: DateStr, kcal: number | null): PersonalDoc {
  return withPerson(doc, person, (p) => {
    const done = { ...p.done };
    if (kcal === null) delete done[date];
    else done[date] = Math.max(0, Math.round(kcal));
    return { ...p, done };
  });
}

/** Свой расход для дня недели (null — вернуть оценку плана). */
export function setOwnKcal(doc: PersonalDoc, person: Person, key: WeekKey, kcal: number | null): PersonalDoc {
  return withPerson(doc, person, (p) => {
    const own = { ...p.kcal };
    if (kcal === null) delete own[key];
    else own[key] = Math.max(0, Math.round(kcal));
    return { ...p, kcal: own };
  });
}

/** Записать замер. Запись на ту же дату заменяется целиком. */
export function saveMeasurement(doc: PersonalDoc, person: Person, m: Measurement): PersonalDoc {
  return withPerson(doc, person, (p) => {
    const rest = p.measurements.filter((x) => x.date !== m.date);
    const hasValue = MEASURE_FIELDS.some((f) => m[f.key] !== undefined);
    const measurements = hasValue ? [...rest, m].sort((a, b) => (a.date < b.date ? -1 : 1)) : rest;
    return { ...p, measurements };
  });
}

export function removeMeasurement(doc: PersonalDoc, person: Person, date: DateStr): PersonalDoc {
  return withPerson(doc, person, (p) => ({ ...p, measurements: p.measurements.filter((x) => x.date !== date) }));
}
