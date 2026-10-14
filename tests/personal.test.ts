/**
 * Тренировки, замеры и расход за день. HOUSEHOLD_SPEC, раздел 10.
 */

import { describe, expect, it } from 'vitest';
import { kcalOf, PLAN } from '../src/household/plan';
import {
  emptyPersonal,
  MEASURE_FIELDS,
  markDone,
  parsePersonal,
  removeMeasurement,
  saveMeasurement,
  setOwnKcal,
  type PersonData,
} from '../src/personal/doc';
import {
  basalRate,
  bodyOn,
  calibrate,
  dayEnergy,
  dayRow,
  DESK_DAY,
  DIGESTION,
  KCAL_PER_KG,
  totalBalance,
  dayRows,
} from '../src/personal/energy';
import { plannedKcal, TRAINING } from '../src/personal/training';
import { MemoryFiles, PERSONAL_FILE, PERSONAL_TMP, PersonalFiles } from '../src/storage';

const MON = '2026-10-05';
const person = (data: Partial<PersonData> = {}): PersonData => ({ done: {}, kcal: {}, measurements: [], ...data });

describe('план тренировок', () => {
  it('у Макса семь дней, недельный расход сходится с таблицей', () => {
    const week = TRAINING.max;
    expect(week.map((d) => d.key)).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
    const sum = (f: 'low' | 'mid' | 'high'): number => week.reduce((s, d) => s + d.kcal[f], 0);
    // В таблице: ≈2 550 (1 900–3 150) — округлённые суммы этих чисел
    expect(sum('mid')).toBe(2540);
    expect(sum('low')).toBe(1890);
    expect(sum('high')).toBe(3160);
    expect(week.every((d) => d.slots.length > 0)).toBe(true);
  });

  it('время в расписании короткое — влезает в колонку и не наезжает на линию дня', () => {
    for (const day of TRAINING.max) {
      for (const slot of day.slots) expect(slot.time, `${day.key}: ${slot.title}`).toMatch(/^(\d{1,2}:\d{2}|\d{1,2}–\d{1,2}|~\d+\u00a0ч|)$/);
    }
  });

  it('среда: шпагаты и складка — по два подхода, голеностоп и вечер — каждые 15 минут', () => {
    const wed = TRAINING.max.find((d) => d.key === 'Ср')!;
    const marks = Object.fromEntries(wed.slots.map((s) => [s.title, s.marks?.length ?? 0]));
    expect(marks['Поперечный шпагат']).toBe(2);
    expect(marks['Складка вперёд']).toBe(2);
    expect(marks['Голеностоп ЗПБ']).toBe(4);
    expect(marks['Шпагат и складка']).toBe(4);
  });

  it('у Ильвины плана пока нет', () => {
    expect(TRAINING.ilvina).toEqual([]);
    expect(plannedKcal('ilvina', 'Пн', {})).toBe(0);
  });

  it('свой расход заменяет оценку плана', () => {
    expect(plannedKcal('max', 'Пн', {})).toBe(250);
    expect(plannedKcal('max', 'Пн', { Пн: 320 })).toBe(320);
    expect(plannedKcal('max', 'Сб', { Пн: 320 })).toBe(700);
  });
});

describe('личные данные', () => {
  it('отметки, свой расход и замеры правятся и переживают запись', () => {
    let doc = emptyPersonal();
    doc = markDone(doc, 'max', MON, 263.4);
    doc = setOwnKcal(doc, 'max', 'Сб', 650);
    doc = saveMeasurement(doc, 'max', { date: '2026-10-12', weight: 81 });
    doc = saveMeasurement(doc, 'max', { date: MON, weight: 82, fat: 18 });
    expect(doc.people.max.done).toEqual({ [MON]: 263 });
    expect(doc.people.max.measurements.map((m) => m.date)).toEqual([MON, '2026-10-12']);
    expect(doc.people.ilvina.measurements).toEqual([]);

    const back = parsePersonal(JSON.stringify(doc))!;
    expect(back).toEqual(doc);

    doc = markDone(doc, 'max', MON, null);
    doc = setOwnKcal(doc, 'max', 'Сб', null);
    expect(doc.people.max.done).toEqual({});
    expect(doc.people.max.kcal).toEqual({});
  });

  it('замер на ту же дату заменяется, пустой — убирается', () => {
    let doc = saveMeasurement(emptyPersonal(), 'max', { date: MON, weight: 82, waist: 84 });
    doc = saveMeasurement(doc, 'max', { date: MON, weight: 81.6 });
    expect(doc.people.max.measurements).toEqual([{ date: MON, weight: 81.6 }]);
    doc = saveMeasurement(doc, 'max', { date: MON });
    expect(doc.people.max.measurements).toEqual([]);
    doc = saveMeasurement(doc, 'max', { date: MON, fat: 17 });
    expect(removeMeasurement(doc, 'max', MON).people.max.measurements).toEqual([]);
  });

  it('основные обхваты — талия, живот, грудь, попа; живот сохраняется', () => {
    expect(MEASURE_FIELDS.filter((f) => f.group === 'main').map((f) => f.label)).toEqual(['Талия', 'Живот', 'Грудь', 'Попа']);
    const doc = saveMeasurement(emptyPersonal(), 'max', { date: MON, waist: 84, belly: 92, chest: 104, hips: 99 });
    expect(parsePersonal(JSON.stringify(doc))!.people.max.measurements).toEqual([
      { date: MON, waist: 84, belly: 92, chest: 104, hips: 99 },
    ]);
  });

  it('мусор в файле пропускается, годное остаётся', () => {
    const text = JSON.stringify({
      format: 'personal-v1',
      people: {
        max: {
          done: { [MON]: 250, 'вчера': 100, '2026-10-06': -5 },
          kcal: { Пн: 300, Xx: 1 },
          measurements: [{ date: MON, weight: 82, fat: 'много' }, { weight: 80 }],
        },
      },
    });
    const doc = parsePersonal(text)!;
    expect(doc.people.max.done).toEqual({ [MON]: 250 });
    expect(doc.people.max.kcal).toEqual({ Пн: 300 });
    expect(doc.people.max.measurements).toEqual([{ date: MON, weight: 82 }]);
    expect(doc.people.ilvina).toEqual(person());
    expect(parsePersonal('{"format":"other"}')).toBeNull();
    expect(parsePersonal('не json')).toBeNull();
  });

  it('файл пишется атомарно, нечитаемый — откладывается', async () => {
    const files = new MemoryFiles();
    const repo = new PersonalFiles(files);
    await repo.save(markDone(emptyPersonal(), 'max', MON, 250));
    expect(files.has(PERSONAL_TMP)).toBe(false);
    expect((await new PersonalFiles(files).load()).doc.people.max.done).toEqual({ [MON]: 250 });

    await files.write(PERSONAL_FILE, '{обрыв');
    const broken = await new PersonalFiles(files).load();
    expect(broken.doc).toEqual(emptyPersonal());
    expect(broken.note).toMatch(/не прочитался/);
  });
});

describe('расход за день', () => {
  it('основной обмен — по сухой массе', () => {
    // 80 кг, 15% жира: сухая масса 68 кг → 370 + 21,6 × 68
    expect(basalRate(80, 15)).toBeCloseTo(1838.8, 5);
  });

  it('из чего складывается расход', () => {
    const e = dayEnergy({ weight: 80, fat: 15, weightDate: MON, fatDate: MON }, 2000, 250);
    expect(e.basal).toBe(1839);
    expect(e.desk).toBe(Math.round(1838.8 * DESK_DAY));
    expect(e.digestion).toBe(2000 * DIGESTION);
    expect(e.training).toBe(250);
    expect(e.total).toBe(e.basal + e.desk + e.digestion + e.training);
    expect(e.balance).toBe(2000 - e.total);
  });

  it('вес и жир берутся из последних замеров, где они есть', () => {
    const ms = [
      { date: MON, weight: 82, fat: 18 },
      { date: '2026-10-12', weight: 81 },
    ];
    expect(bodyOn(ms, '2026-10-13')).toMatchObject({ weight: 81, fat: 18, fatDate: MON });
    // До первого замера — по первому
    expect(bodyOn(ms, '2026-10-01')).toMatchObject({ weight: 82, fat: 18 });
    expect(bodyOn([{ date: MON, weight: 82 }], MON)).toBeNull();
  });

  it('тренировка входит в расход, только когда отмечена', () => {
    const data = person({ measurements: [{ date: MON, weight: 80, fat: 15 }], done: { [MON]: 270 } });
    const today = '2026-10-07';
    const mon = dayRow(PLAN, 'max', data, MON, today);
    const tue = dayRow(PLAN, 'max', data, '2026-10-06', today);
    const wed = dayRow(PLAN, 'max', data, today, today);
    const fri = dayRow(PLAN, 'max', data, '2026-10-09', today);
    expect([mon.training, tue.training, wed.training, fri.training]).toEqual(['done', 'missed', 'pending', 'planned']);
    expect(mon.energy!.training).toBe(270);
    expect(tue.energy!.training).toBe(0);
    expect(wed.energy!.training).toBe(0);
    expect(fri.energy!.training).toBe(300);
    expect(mon.energy!.intake).toBe(kcalOf(PLAN, 'max', 'Пн'));
  });

  it('без веса и жира расход не считается', () => {
    expect(dayRow(PLAN, 'max', person(), MON, MON).energy).toBeNull();
  });

  it('сверка с весами: поправка к расходу на день', () => {
    const data = person({
      measurements: [
        { date: MON, weight: 80, fat: 15 },
        { date: '2026-10-12', weight: 79.5 },
      ],
      done: { [MON]: 250, '2026-10-06': 240, '2026-10-07': 150, '2026-10-08': 200, '2026-10-09': 300, '2026-10-10': 700, '2026-10-11': 700 },
    });
    const c = calibrate(PLAN, 'max', data, '2026-10-12')!;
    expect(c.days).toBe(7);
    expect(c.actual).toBeCloseTo(-0.5, 5);
    const week = dayRows(PLAN, 'max', data, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'], '2026-10-12');
    expect(c.predicted).toBeCloseTo(totalBalance(week) / KCAL_PER_KG, 5);
    expect(c.gapPerDay).toBe(Math.round(((c.predicted - c.actual) * KCAL_PER_KG) / 7));
  });

  it('сверки нет, пока взвешивания ближе недели', () => {
    const data = person({ measurements: [{ date: MON, weight: 80, fat: 15 }, { date: '2026-10-08', weight: 79.8 }] });
    expect(calibrate(PLAN, 'max', data, '2026-10-08')).toBeNull();
  });
});
