/**
 * Палитра: цветовая математика и вывод токенов 3.9 из четырёх ролей.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PALETTE,
  MAX_BUTTON_LIGHTNESS,
  MAX_DEEP_LIGHTNESS,
  MAX_FILL_LIGHTNESS,
  PRESETS,
  ROLES,
  derivePair,
  hexToHsl,
  hslToHex,
  isHex,
  paletteVars,
} from '../src/ui/palette';

/** Один шаг канала hex — 1/255, отсюда допуск при сверке светлоты. */
const HEX_STEP = 0.4;

describe('перевод цвета', () => {
  it('туда и обратно возвращает тот же цвет', () => {
    for (const hex of ['#22C46E', '#1C6BFF', '#F2A23C', '#E2554A', '#000000', '#FFFFFF', '#8B5CB8']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex.toUpperCase());
    }
  });

  it('разбирает зелёный спецификации', () => {
    const hsl = hexToHsl('#22C46E');
    expect(hsl.h).toBeGreaterThan(140);
    expect(hsl.h).toBeLessThan(160);
    expect(hsl.l).toBeCloseTo(45, 0);
  });

  it('серое остаётся серым', () => {
    expect(hexToHsl('#808080').s).toBe(0);
    expect(hslToHex({ h: 0, s: 0, l: 50 })).toBe('#808080');
  });

  it('всегда отдаёт корректный hex', () => {
    for (let h = 0; h < 360; h += 37) {
      for (const l of [0, 12, 50, 88, 100]) {
        expect(isHex(hslToHex({ h, s: 70, l }))).toBe(true);
      }
    }
  });
});

describe('вывод пары из одного цвета', () => {
  it('глубокий конец темнее светлого', () => {
    const pair = derivePair('#22C46E');
    expect(hexToHsl(pair.b).l).toBeLessThan(hexToHsl(pair.a).l);
    expect(hexToHsl(pair.empty).l).toBeLessThan(hexToHsl(pair.b).l);
  });

  it('из зелёного спецификации выходит пара, близкая к исходной', () => {
    const pair = derivePair('#22C46E');
    expect(pair.a).toBe('#22C46E');
    // Эталон 3.9 — #06834A, отклонение по светлоте в пределах пары пунктов
    expect(Math.abs(hexToHsl(pair.b).l - hexToHsl('#06834A').l)).toBeLessThanOrEqual(2);
  });

  it('слишком светлый цвет подрезается: белый текст лежит на глубоком конце', () => {
    for (const bright of ['#FFFFFF', '#FFF9B0', '#9FE8C2']) {
      const pair = derivePair(bright);
      expect(hexToHsl(pair.a).l).toBeLessThanOrEqual(MAX_FILL_LIGHTNESS + HEX_STEP);
      expect(hexToHsl(pair.b).l).toBeLessThanOrEqual(MAX_DEEP_LIGHTNESS + HEX_STEP);
    }
  });

  it('глубокий конец не светлее потолка ни при каком выборе', () => {
    for (let h = 0; h < 360; h += 29) {
      for (const l of [5, 25, 50, 75, 95]) {
        const pair = derivePair(hslToHex({ h, s: 80, l }));
        expect(hexToHsl(pair.b).l).toBeLessThanOrEqual(MAX_DEEP_LIGHTNESS + HEX_STEP);
      }
    }
  });

  it('очень тёмный цвет не уходит в чёрную кашу', () => {
    const pair = derivePair('#050505');
    expect(hexToHsl(pair.b).l).toBeGreaterThanOrEqual(8 - HEX_STEP);
    expect(hexToHsl(pair.empty).l).toBeGreaterThanOrEqual(5 - HEX_STEP);
  });
});

describe('токены из палитры', () => {
  const vars = paletteVars(DEFAULT_PALETTE);

  it('задаются все, что зависят от палитры', () => {
    expect(Object.keys(vars).sort()).toEqual(
      [
        '--acid-green',
        '--acid-red',
        '--alarm',
        '--blue',
        '--blue-press',
        '--green-a',
        '--green-b',
        '--green-empty',
        '--short-a',
        '--short-b',
        '--short-empty',
        '--warn-a',
        '--warn-b',
        '--warn-empty',
      ].sort(),
    );
  });

  it('все значения — корректный hex', () => {
    for (const value of Object.values(vars)) expect(isHex(value)).toBe(true);
  });

  it('палитра по умолчанию воспроизводит цвета спецификации', () => {
    expect(vars['--green-a']).toBe('#22C46E');
    expect(vars['--blue']).toBe('#1C6BFF');
    expect(vars['--warn-a']).toBe('#F2A23C');
    expect(vars['--short-a']).toBe('#E2554A');
  });

  it('нажатая кнопка темнее обычной', () => {
    expect(hexToHsl(vars['--blue-press']!).l).toBeLessThan(hexToHsl(vars['--blue']!).l);
  });

  it('кнопка не бывает слишком светлой', () => {
    const light = paletteVars({ ...DEFAULT_PALETTE, add: '#DDEEFF' });
    expect(hexToHsl(light['--blue']!).l).toBeLessThanOrEqual(MAX_BUTTON_LIGHTNESS + HEX_STEP);
  });
});

describe('готовые палитры', () => {
  it('в каждой заданы все роли корректным hex', () => {
    for (const preset of PRESETS) {
      for (const role of ROLES) {
        expect(isHex(preset.palette[role.id])).toBe(true);
      }
    }
  });

  it('первая — та, что в спецификации', () => {
    expect(PRESETS[0]!.palette).toEqual(DEFAULT_PALETTE);
  });

  it('ни одна не даёт нечитаемых заливок', () => {
    for (const preset of PRESETS) {
      const vars = paletteVars(preset.palette);
      for (const name of ['--green-b', '--warn-b', '--short-b']) {
        expect(hexToHsl(vars[name]!).l).toBeLessThanOrEqual(MAX_DEEP_LIGHTNESS + HEX_STEP);
      }
    }
  });
});
