/**
 * Что попадает в поле flow операции. Раздел 1.3, инвариант 5.
 */

import { describe, expect, it } from 'vitest';
import { flowToStore } from '../src/domain/flow';
import type { Category } from '../src/domain/types';
import { emptyDoc } from './fixtures';

const categories = emptyDoc().categories;
const routine = categories.find((c) => c.name === 'Продукты')!;   // defaultFlow ROUTINE
const oneOff = categories.find((c) => c.name === 'Техника')!;     // defaultFlow ONE_OFF
const income = categories.find((c) => c.name === 'Зарплата')!;

describe('поле хранится только когда переопределяет категорию', () => {
  it('совпало с подсказкой — поля нет', () => {
    expect(flowToStore('ROUTINE', routine)).toBeUndefined();
    expect(flowToStore('ONE_OFF', oneOff)).toBeUndefined();
  });

  it('разошлось с подсказкой — поле пишется', () => {
    // Тот самый случай из 1.2: день рождения в кафе — разовое,
    // хотя кафе по умолчанию рутина
    expect(flowToStore('ONE_OFF', routine)).toBe('ONE_OFF');
    expect(flowToStore('ROUTINE', oneOff)).toBe('ROUTINE');
  });

  it('у дохода потока нет никогда', () => {
    expect(flowToStore('ROUTINE', income)).toBeUndefined();
    expect(flowToStore('ONE_OFF', income)).toBeUndefined();
  });

  it('категория неизвестна — сохраняется выбор', () => {
    expect(flowToStore('ONE_OFF', undefined)).toBe('ONE_OFF');
  });
});

describe('выбор пользователя доживает до документа', () => {
  it('разовая трата в рутинной категории остаётся разовой', () => {
    const chosen = 'ONE_OFF';
    const stored = flowToStore(chosen, routine);
    // Читается обратно правилом flow ?? defaultFlow
    const effective = (stored ?? routine.defaultFlow) as Category['defaultFlow'];
    expect(effective).toBe(chosen);
  });

  it('рутинная трата в разовой категории остаётся рутинной', () => {
    const chosen = 'ROUTINE';
    const stored = flowToStore(chosen, oneOff);
    expect(stored ?? oneOff.defaultFlow).toBe(chosen);
  });
});
