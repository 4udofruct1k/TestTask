import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatAmountExact,
  isMoney,
  isPositiveMoney,
  parseAmount,
  toMoney,
} from '../src/domain/money';

const NBSP = ' ';

describe('разбор ввода в копейки', () => {
  it('целые рубли', () => {
    expect(parseAmount('1500')).toBe(150000);
    expect(parseAmount('0')).toBe(0);
  });

  it('копейки через запятую и точку', () => {
    expect(parseAmount('1500,50')).toBe(150050);
    expect(parseAmount('1500.5')).toBe(150050);
    expect(parseAmount('0,07')).toBe(7);
  });

  it('пробелы-разделители разрядов не мешают', () => {
    expect(parseAmount('1 500,50')).toBe(150050);
    expect(parseAmount(`120${NBSP}000`)).toBe(12000000);
  });

  it('мусор и лишние знаки после запятой отвергаются', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('10,555')).toBeNull();
    expect(parseAmount('1,2,3')).toBeNull();
    expect(parseAmount('-')).toBeNull();
  });
});

describe('форматирование', () => {
  it('в списках — целые рубли с разрядами', () => {
    expect(formatAmount(12000000)).toBe(`120${NBSP}000`);
    expect(formatAmount(150050)).toBe(`1${NBSP}501`);
    expect(formatAmount(99900)).toBe('999');
    expect(formatAmount(0)).toBe('0');
  });

  it('крупные суммы не сокращаются', () => {
    expect(formatAmount(830000000)).toBe(`8${NBSP}300${NBSP}000`);
  });

  it('отрицательные — со знаком минус', () => {
    expect(formatAmount(-1000000)).toBe(`-10${NBSP}000`);
    expect(formatAmountExact(-150050)).toBe(`-1${NBSP}500,50`);
  });

  it('при вводе и правке — с копейками', () => {
    expect(formatAmountExact(150050)).toBe(`1${NBSP}500,50`);
    expect(formatAmountExact(120833)).toBe(`1${NBSP}208,33`);
    expect(formatAmountExact(7)).toBe('0,07');
  });
});

describe('защита от нецелых значений', () => {
  it('isMoney пропускает только целые числа', () => {
    expect(isMoney(100)).toBe(true);
    expect(isMoney(-100)).toBe(true);
    expect(isMoney(100.5)).toBe(false);
    expect(isMoney('100')).toBe(false);
    expect(isMoney(NaN)).toBe(false);
  });

  it('isPositiveMoney требует строго больше нуля', () => {
    expect(isPositiveMoney(1)).toBe(true);
    expect(isPositiveMoney(0)).toBe(false);
    expect(isPositiveMoney(-1)).toBe(false);
  });

  it('toMoney округляет и не пропускает нечисло', () => {
    expect(toMoney(120833.333)).toBe(120833);
    expect(toMoney(120833.5)).toBe(120834);
    expect(() => toMoney(NaN)).toThrow();
    expect(() => toMoney(Infinity)).toThrow();
  });
});
