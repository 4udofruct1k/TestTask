/**
 * Дни для общих разделов: какой сегодня день недели и какой будет завтра.
 *
 * Бюджет считает месяцами и дневной арифметики в своём домене не держит
 * намеренно. Здесь она нужна: готовка и покупки привязаны к дню недели.
 * Считается разбором строки, без системных часов и без Date — тот же код
 * работает в облачной функции.
 */

export type DateStr = string;

/** Дни от 1970-01-01 по григорианскому календарю (алгоритм Хиннанта). */
function toDays(date: DateStr): number {
  let y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDays(days: number): DateStr {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(date: DateStr, n: number): DateStr {
  return fromDays(toDays(date) + n);
}

/** Понедельник — 0, воскресенье — 6. 1970-01-01 был четвергом. */
export function weekdayOf(date: DateStr): number {
  return (((toDays(date) + 3) % 7) + 7) % 7;
}

export const WEEK_KEYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
export type WeekKey = (typeof WEEK_KEYS)[number];

export function weekKeyOf(date: DateStr): WeekKey {
  return WEEK_KEYS[weekdayOf(date)]!;
}

/** Даты недели, в которую попадает date: с понедельника по воскресенье. */
export function weekOf(date: DateStr): DateStr[] {
  const monday = addDays(date, -weekdayOf(date));
  return WEEK_KEYS.map((_, i) => addDays(monday, i));
}
