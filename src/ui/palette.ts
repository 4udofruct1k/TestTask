/**
 * Редактируемая палитра. Раздел 3.9.
 *
 * Пользователь задаёт по одному цвету на роль, остальное выводится: пара
 * градиента, тёмная часть шкалы, нажатое состояние, линия графика. Иначе
 * пришлось бы просить четырнадцать цветов и любой из них мог бы разъехаться
 * с остальными.
 *
 * Светлота выбранного цвета подрезается сверху: на всех этих заливках лежит
 * белый текст, и сделать его нечитаемым приложение не даёт.
 */

export type PaletteRole = 'money' | 'add' | 'warn' | 'over';

export type Palette = Record<PaletteRole, string>;

export interface RoleInfo {
  id: PaletteRole;
  title: string;
  hint: string;
}

/** Смысл ролей — тот же, что в 3.9: больше цветов в интерфейсе нет. */
export const ROLES: RoleInfo[] = [
  { id: 'money', title: 'Деньги', hint: 'Блок бюджета, полосы прогресса' },
  { id: 'add', title: 'Добавление', hint: 'Кнопки ввода, ссылки, чипы' },
  { id: 'warn', title: 'Предупреждение', hint: 'Шкала подошла к цели' },
  { id: 'over', title: 'Превышение', hint: 'Цель не закрывается, перерасход' },
];

export const DEFAULT_PALETTE: Palette = {
  money: '#22C46E',
  add: '#1C6BFF',
  warn: '#F2A23C',
  over: '#E2554A',
};

export interface Preset {
  id: string;
  title: string;
  palette: Palette;
}

export const PRESETS: Preset[] = [
  { id: 'emerald', title: 'Изумруд', palette: DEFAULT_PALETTE },
  { id: 'ocean', title: 'Океан', palette: { money: '#1FB6C4', add: '#2563EB', warn: '#E8A13A', over: '#E05263' } },
  { id: 'graphite', title: 'Графит', palette: { money: '#5E7A6B', add: '#4A6FA5', warn: '#C08A3E', over: '#B85A50' } },
  { id: 'sunset', title: 'Закат', palette: { money: '#E07A3F', add: '#2E6FD9', warn: '#D9A441', over: '#C94F45' } },
  { id: 'plum', title: 'Слива', palette: { money: '#8B5CB8', add: '#3B6FE0', warn: '#DFA03C', over: '#D2504F' } },
];

// ------------------------------------------------------------ цветовая математика

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  // Без округления: иначе перевод туда-обратно теряет по единице на канал
  // и палитра по умолчанию перестаёт совпадать с цветами спецификации
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] :
    [c, 0, x];

  const channel = (value: number): string =>
    Math.round((value + m) * 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/**
 * Потолок светлоты светлого конца градиента. Он держит цвет цветом:
 * почти белую заливку выбрать нельзя.
 */
export const MAX_FILL_LIGHTNESS = 68;
/**
 * Потолок глубокого конца. Градиент развёрнут глубоким тоном влево,
 * и текст лежит именно на нём — поэтому ограничение стоит здесь, а не выше.
 */
export const MAX_DEEP_LIGHTNESS = 46;
/** Потолок для кнопок: текста на них меньше и он крупнее. */
export const MAX_BUTTON_LIGHTNESS = 58;

export interface DerivedPair {
  /** Светлый конец градиента */
  a: string;
  /** Глубокий конец, он же цвет полос */
  b: string;
  /** Разряженная часть шкалы */
  empty: string;
  /** Линия графика: ярче и насыщеннее */
  line: string;
}

export function derivePair(base: string): DerivedPair {
  const hsl = hexToHsl(base);
  const lightL = Math.min(hsl.l, MAX_FILL_LIGHTNESS);
  const deepL = clamp(Math.min(lightL - 18, MAX_DEEP_LIGHTNESS), 8, MAX_DEEP_LIGHTNESS);
  return {
    a: hslToHex({ ...hsl, l: lightL }),
    b: hslToHex({ h: hsl.h, s: Math.min(100, hsl.s + 15), l: deepL }),
    empty: hslToHex({ h: hsl.h, s: Math.min(100, hsl.s + 5), l: Math.max(5, deepL * 0.45) }),
    line: hslToHex({ h: hsl.h, s: Math.min(100, hsl.s + 30), l: clamp(lightL - 3, 30, 55) }),
  };
}

/** Значения токенов 3.9, которые задаёт палитра. Чистая функция — её и тестируем. */
export function paletteVars(palette: Palette): Record<string, string> {
  const money = derivePair(palette.money);
  const warn = derivePair(palette.warn);
  const over = derivePair(palette.over);

  const addHsl = hexToHsl(palette.add);
  const addL = Math.min(addHsl.l, MAX_BUTTON_LIGHTNESS);

  return {
    '--green-a': money.a,
    '--green-b': money.b,
    '--green-empty': money.empty,
    '--acid-green': money.line,

    '--blue': hslToHex({ ...addHsl, l: addL }),
    '--blue-press': hslToHex({ ...addHsl, l: Math.max(10, addL - 11) }),

    '--warn-a': warn.a,
    '--warn-b': warn.b,
    '--warn-empty': warn.empty,

    '--short-a': over.a,
    '--short-b': over.b,
    '--short-empty': over.empty,
    '--alarm': over.a,
    '--acid-red': over.line,
  };
}

export function applyPalette(palette: Palette): void {
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(paletteVars(palette))) {
    style.setProperty(name, value);
  }
}

const KEY = 'budget-palette';

export function loadPalette(): Palette {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PALETTE;
    const parsed = JSON.parse(raw) as Partial<Palette>;
    const out = { ...DEFAULT_PALETTE };
    for (const role of ROLES) {
      const value = parsed[role.id];
      if (typeof value === 'string' && isHex(value)) out[role.id] = value.toUpperCase();
    }
    return out;
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function savePalette(palette: Palette): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(palette));
  } catch {
    // Приватный режим — палитра просто не запомнится
  }
}
