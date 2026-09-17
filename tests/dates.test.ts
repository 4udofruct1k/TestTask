import { describe, expect, it } from 'vitest';
import {
  addMonths,
  compareMonth,
  dayOfMonth,
  daysInMonth,
  isDateStr,
  isLeapYear,
  isMonthKey,
  monthKeyOf,
  monthRange,
  monthsBetween,
} from '../src/domain/dates';

describe('високосный год', () => {
  it('2024 високосный: делится на 4, не на 100', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(daysInMonth('2024-02')).toBe(29);
  });

  it('2100 не високосный: делится на 100, не на 400', () => {
    expect(isLeapYear(2100)).toBe(false);
    expect(daysInMonth('2100-02')).toBe(28);
  });

  it('2000 високосный: делится на 400', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth('2000-02')).toBe(29);
  });

  it('1900 не високосный', () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(daysInMonth('1900-02')).toBe(28);
  });
});

describe('daysInMonth для всех двенадцати месяцев', () => {
  const expected = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  expected.forEach((days, i) => {
    const month = `2026-${String(i + 1).padStart(2, '0')}`;
    it(`${month} → ${days}`, () => {
      expect(daysInMonth(month)).toBe(days);
    });
  });
});

describe('addMonths через границу года', () => {
  it('вперёд через декабрь', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
  });

  it('назад через январь', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-02', -14)).toBe('2024-12');
  });

  it('целыми годами и на месте', () => {
    expect(addMonths('2026-03', 12)).toBe('2027-03');
    expect(addMonths('2026-03', -12)).toBe('2025-03');
    expect(addMonths('2026-03', 0)).toBe('2026-03');
    expect(addMonths('2026-03', 25)).toBe('2028-04');
  });
});

describe('прочие примитивы', () => {
  it('monthKeyOf и dayOfMonth разбирают строку', () => {
    expect(monthKeyOf('2026-03-16')).toBe('2026-03');
    expect(dayOfMonth('2026-03-16')).toBe(16);
    expect(dayOfMonth('2026-03-01')).toBe(1);
  });

  it('monthsBetween считает разницу со знаком', () => {
    expect(monthsBetween('2026-01', '2026-03')).toBe(2);
    expect(monthsBetween('2026-03', '2026-01')).toBe(-2);
    expect(monthsBetween('2025-12', '2026-01')).toBe(1);
    expect(monthsBetween('2026-03', '2026-03')).toBe(0);
  });

  it('compareMonth упорядочивает хронологически', () => {
    expect(compareMonth('2026-01', '2026-02')).toBe(-1);
    expect(compareMonth('2026-02', '2026-01')).toBe(1);
    expect(compareMonth('2026-02', '2026-02')).toBe(0);
    expect(compareMonth('2025-12', '2026-01')).toBe(-1);
  });

  it('monthRange включает границы и пуст при перевёрнутом порядке', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthRange('2026-03', '2026-03')).toEqual(['2026-03']);
    expect(monthRange('2026-04', '2026-03')).toEqual([]);
  });

  it('распознаёт корректные и битые строки', () => {
    expect(isMonthKey('2026-03')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-3')).toBe(false);
    expect(isMonthKey('2026-03-16')).toBe(false);
    expect(isDateStr('2024-02-29')).toBe(true);
    expect(isDateStr('2026-02-29')).toBe(false);
    expect(isDateStr('2026-04-31')).toBe(false);
    expect(isDateStr('2026-03-16')).toBe(true);
    expect(isDateStr('2026-03-00')).toBe(false);
  });
});
