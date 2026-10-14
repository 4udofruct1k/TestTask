/**
 * План тренировок на неделю. HOUSEHOLD_SPEC, раздел 9.
 *
 * Зашит в приложение, как план питания. Тренировки Макса идут подходами
 * внутри рабочего дня: в начале часа и каждые 15 минут. План Ильвины
 * добавится отдельной версией.
 */

import type { WeekKey } from '../household/days';
import type { Person } from '../household/types';

/** Расход тренировки, ккал: середина оценки и разброс. */
export interface KcalRange {
  mid: number;
  low: number;
  high: number;
}

export interface Slot {
  /** «11:00», «20–21», «~2 ч». Пусто — без времени. Короткое: колонка времени узкая */
  time: string;
  /** Минуты подходов внутри часа: «:00», «:15»… */
  marks?: string[];
  /** Непрерывный блок: до какого времени, «12:15» */
  until?: string;
  title: string;
  /** Как делать: техника, на что смотреть */
  note?: string;
  kind?: 'warmup' | 'break' | 'evening';
}

export type Focus = 'legs' | 'arms' | 'stretch' | 'technique' | 'chest' | 'volleyball';

export interface TrainingDay {
  key: WeekKey;
  focus: Focus;
  /** «Ноги» — крупно в шапке дня */
  title: string;
  emoji: string;
  /** Уточнение под заголовком */
  subtitle?: string;
  kcal: KcalRange;
  slots: Slot[];
}

const EVERY_15 = [':00', ':15', ':30', ':45'];
const LUNCH: Slot = { time: '14–15', title: 'Обед', kind: 'break' };

const MAX_WEEK: TrainingDay[] = [
  {
    key: 'Пн',
    focus: 'legs',
    title: 'Ноги',
    emoji: '🦵',
    kcal: { mid: 250, low: 190, high: 310 },
    slots: [
      { time: '11:00', title: 'Растяжка, разогрев', kind: 'warmup' },
      { time: '12:00', marks: EVERY_15, title: 'Прыжки вверх на максимум' },
      { time: '13:00', marks: EVERY_15, title: 'Подъём на носки → спрыгивания' },
      LUNCH,
      { time: '15:00', marks: [':00', ':30'], title: 'Выпады → прыжки из седа' },
      { time: '15:15', marks: [':15', ':45'], title: 'Подъём на носки → прыжки из седа' },
      { time: '16:00', marks: EVERY_15, title: 'Выпады → прыжки с колен' },
      { time: '17:00', marks: EVERY_15, title: 'Максимальная тяга вверх, 10 с' },
    ],
  },
  {
    key: 'Вт',
    focus: 'arms',
    title: 'Руки',
    emoji: '💪',
    kcal: { mid: 240, low: 180, high: 300 },
    slots: [
      { time: '11:00', title: 'Растяжка, разогрев', kind: 'warmup' },
      { time: '12:00', marks: EVERY_15, title: 'Разгибание руки с гантелью в горизонт', note: 'Трицепс' },
      { time: '13:00', marks: EVERY_15, title: 'Гантель из-за головы', note: 'Трицепс' },
      LUNCH,
      { time: '15:00', marks: EVERY_15, title: 'Сгибания на бицепс' },
      { time: '16:00', marks: EVERY_15, title: 'Удержание гантели на вытянутой руке, 10 с', note: 'Максимальный вес' },
      { time: '17:00', marks: EVERY_15, title: 'Махи в стороны' },
      { time: '18:00', marks: EVERY_15, title: 'Махи в стороны в наклоне' },
      { time: '20–21', title: 'Брусья и турник поочерёдно', note: 'По восстановлению', kind: 'evening' },
    ],
  },
  {
    key: 'Ср',
    focus: 'stretch',
    title: 'Растяжка',
    emoji: '🧘',
    kcal: { mid: 150, low: 100, high: 200 },
    slots: [
      { time: '11:00', title: 'Разминка, разогрев', kind: 'warmup' },
      // Растяжка — не подходы, а блоки по 15 минут, каждый по разу
      { time: '12:00', until: '12:15', title: 'Поперечный шпагат' },
      { time: '12:30', until: '12:45', title: 'Складка вперёд' },
      { time: '14:00', until: '14:15', title: 'Продольный шпагат вправо' },
      { time: '14:30', until: '14:45', title: 'Продольный шпагат влево' },
      { time: '16:00', until: '16:15', title: 'Голеностоп' },
      { time: '16:30', until: '16:45', title: 'Задняя поверхность бедра' },
      { time: '18:00', until: '18:15', title: 'Шпагат' },
      { time: '18:30', until: '18:45', title: 'Складка' },
    ],
  },
  {
    key: 'Чт',
    focus: 'technique',
    title: 'Техника',
    emoji: '🏐',
    subtitle: 'Для правши, прыжки вполсилы',
    kcal: { mid: 200, low: 150, high: 240 },
    slots: [
      { time: '11:00', title: 'Разогрев', kind: 'warmup' },
      {
        time: '12:00',
        marks: EVERY_15,
        title: 'Замах «лук» медленно, пауза 2 с в «луке»',
        note:
          '«Лук»: правый локоть выше плеча, кисть за головой, левая рука вверх, грудь развёрнута вправо. Удар: левая рука вниз к животу, корпус доворачивается, первым идёт локоть, рука выпрямляется впереди правого плеча.',
      },
      {
        time: '13:00',
        marks: EVERY_15,
        title: 'Удар с полотенцем',
        note: 'Полный замах в полную скорость, полотенце держать за край. Щелчок впереди и вверху, не сбоку.',
      },
      LUNCH,
      {
        time: '15:00',
        marks: EVERY_15,
        title: 'Мяч в верхней точке',
        note:
          'Левой подбросить мяч на 40–50 см выше вытянутой правой, чуть впереди плеча. Из «лука» поймать одной рукой на прямой руке в самой верхней точке.',
      },
      {
        time: '16:00',
        marks: EVERY_15,
        title: '2 последних шага разбега',
        note:
          'Правой длинный низкий шаг с пятки, руки назад-вверх. Левая быстро приставляется чуть впереди, носком вправо. Замереть в позиции отталкивания.',
      },
      {
        time: '17:00',
        marks: EVERY_15,
        title: 'Мах руками в прыжке с места + замах',
        note:
          'Руки назад вместе с полуприседом, затем вперёд-вверх и прыжок. К моменту отрыва руки наверху, в воздухе сразу «лук».',
      },
      {
        time: '18:00',
        marks: EVERY_15,
        title: 'Медленный полный удар на месте, затем как раньше',
        note: 'Сравнивать и подмечать отличия.',
      },
      { time: '20–21', title: 'Разбег, прыжок, удар без мяча', note: 'С контролем техники', kind: 'evening' },
    ],
  },
  {
    key: 'Пт',
    focus: 'chest',
    title: 'Грудь',
    emoji: '🏋️',
    kcal: { mid: 300, low: 230, high: 370 },
    slots: [
      { time: '11:00', title: 'Разогрев', kind: 'warmup' },
      { time: '12:00', marks: EVERY_15, title: 'Жим лёжа с гантелями' },
      { time: '13:00', marks: EVERY_15, title: 'Тяга гантелей в наклоне' },
      LUNCH,
      { time: '15:00', marks: EVERY_15, title: 'Сведения гантелей' },
      { time: '16:00', marks: EVERY_15, title: 'Тяга гантели с опорой на диван' },
      { time: '17:00', marks: EVERY_15, title: 'Отжимания широкие' },
      { time: '18:00', marks: EVERY_15, title: 'Отжимания узкие' },
      { time: '20–21', title: 'Брусья, турник, тяга штанги в наклоне', kind: 'evening' },
    ],
  },
  {
    key: 'Сб',
    focus: 'volleyball',
    title: 'Волейбол',
    emoji: '🏐',
    subtitle: 'Около двух часов игры и прогулка',
    kcal: { mid: 700, low: 520, high: 870 },
    slots: [
      { time: '~2 ч', title: 'Волейбол' },
      { time: '', title: 'Прогулка' },
    ],
  },
  {
    key: 'Вс',
    focus: 'volleyball',
    title: 'Волейбол',
    emoji: '🏐',
    subtitle: 'Около двух часов игры и прогулка',
    kcal: { mid: 700, low: 520, high: 870 },
    slots: [
      { time: '~2 ч', title: 'Волейбол' },
      { time: '', title: 'Прогулка' },
    ],
  },
];

/** План по людям. Пустой список — плана пока нет. */
export const TRAINING: Record<Person, TrainingDay[]> = {
  max: MAX_WEEK,
  ilvina: [],
};

export function trainingDay(person: Person, key: WeekKey): TrainingDay | null {
  return TRAINING[person].find((d) => d.key === key) ?? null;
}

/**
 * Расход тренировки дня: свой, если вписан, иначе середина оценки плана.
 * own — свои значения по дням недели.
 */
export function plannedKcal(person: Person, key: WeekKey, own: Partial<Record<WeekKey, number>>): number {
  const value = own[key];
  if (value !== undefined) return value;
  return trainingDay(person, key)?.kcal.mid ?? 0;
}
