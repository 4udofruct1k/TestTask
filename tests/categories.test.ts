/**
 * Правила категорий (1.2) и разрез трат для кольца (3.5).
 *
 * Кольцо ограничено шестью долями: это не вкус, а предел различимости —
 * седьмой сектор либо повторит цвет, либо станет неотличим от соседа.
 */

import { describe, expect, it } from 'vitest';
import {
  isCategoryNameTaken,
  isCategoryNameValid,
  MAX_CATEGORY_NAME,
  normalizeCategoryName,
} from '../src/domain/categories';
import type { BudgetDocument, Category } from '../src/domain/types';
import { breakdownOf } from '../src/ui/screens/dashboards';
import { emptyDoc, expense, monthly, R } from './fixtures';

const TODAY = '2026-03-16';

describe('имя категории', () => {
  const categories = emptyDoc().categories;

  it('обрезается по краям и по длине', () => {
    expect(normalizeCategoryName('  Бензин  ')).toBe('Бензин');
    expect(normalizeCategoryName('я'.repeat(80))).toHaveLength(MAX_CATEGORY_NAME);
  });

  it('занято без учёта регистра', () => {
    expect(isCategoryNameTaken(categories, 'EXPENSE', 'продукты')).toBe(true);
    expect(isCategoryNameTaken(categories, 'EXPENSE', ' ПРОДУКТЫ ')).toBe(true);
  });

  it('занятость считается внутри направления', () => {
    // «Продукты» есть среди трат, но не среди доходов
    expect(isCategoryNameTaken(categories, 'INCOME', 'Продукты')).toBe(false);
  });

  it('сама правящаяся категория себе не мешает', () => {
    expect(isCategoryNameValid(categories, 'EXPENSE', 'Продукты', 'c-food')).toBe(true);
    expect(isCategoryNameValid(categories, 'EXPENSE', 'Продукты', 'c-tech')).toBe(false);
  });

  it('пустое имя не сохраняется', () => {
    expect(isCategoryNameValid(categories, 'EXPENSE', '   ')).toBe(false);
  });
});

/** Документ с n категориями трат, в каждой по одной трате убывающей суммы. */
function docWithCategories(n: number): BudgetDocument {
  const doc = emptyDoc();
  const extra: Category[] = Array.from({ length: n }, (_, i) => ({
    id: `c-${i}`,
    name: `Категория ${i}`,
    kind: 'EXPENSE' as const,
    essential: false,
    defaultFlow: 'ROUTINE' as const,
    icon: '🏷️',
    color: '#6B7A70',
    archived: false,
    sortOrder: 10 + i,
  }));
  doc.categories = [...doc.categories, ...extra];
  doc.expenses = extra.map((category, i) => expense('2026-03-10', R(1000 * (n - i)), category.id));
  return doc;
}

describe('разрез по категориям', () => {
  it('шесть категорий показываются как есть', () => {
    const view = breakdownOf(docWithCategories(6), ['2026-03'], 'category');
    expect(view.rows).toHaveLength(6);
    expect(view.folded).toBe(0);
  });

  it('хвост сворачивается, долей всё равно шесть', () => {
    const view = breakdownOf(docWithCategories(12), ['2026-03'], 'category');
    expect(view.rows).toHaveLength(6);
    expect(view.folded).toBe(7);
    expect(view.rows[5]!.label).toBe('Ещё 7 категорий');
  });

  it('свёрнутая доля равна сумме хвоста — итог не теряется', () => {
    const doc = docWithCategories(12);
    const view = breakdownOf(doc, ['2026-03'], 'category');
    const sum = view.rows.reduce((acc, row) => acc + row.amount, 0);
    expect(sum).toBe(view.total);
    expect(view.total).toBe(doc.expenses.reduce((acc, e) => acc + e.amount, 0));
  });

  it('доли складываются в единицу', () => {
    const view = breakdownOf(docWithCategories(12), ['2026-03'], 'category');
    const share = view.rows.reduce((acc, row) => acc + row.share, 0);
    expect(share).toBeCloseTo(1, 10);
  });

  it('цвета внутри разреза не повторяются', () => {
    const view = breakdownOf(docWithCategories(12), ['2026-03'], 'category');
    expect(new Set(view.rows.map((row) => row.color)).size).toBe(view.rows.length);
  });

  it('пустой месяц — ни одной доли', () => {
    const view = breakdownOf(emptyDoc(), ['2026-03'], 'category');
    expect(view.rows).toEqual([]);
    expect(view.total).toBe(0);
  });

  it('месяцы периода складываются', () => {
    const doc = emptyDoc();
    doc.expenses = [expense('2026-02-10', R(1000), 'c-food'), expense('2026-03-10', R(500), 'c-food')];
    const view = breakdownOf(doc, ['2026-02', '2026-03'], 'category');
    expect(view.total).toBe(R(1500));
    expect(view.rows[0]!.count).toBe(2);
  });
});

describe('разрез по видам', () => {
  function mixedDoc(): BudgetDocument {
    const doc = emptyDoc();
    doc.fixedItems = [monthly('Аренда', 'EXPENSE', 'c-home', [{ fromMonth: '2026-01', amount: R(30000) }])];
    doc.expenses = [
      expense('2026-03-02', R(2000), 'c-food'),
      expense('2026-03-05', R(8000), 'c-tech', 'ONE_OFF'),
    ];
    return doc;
  }

  it('три вида в постоянном порядке', () => {
    const view = breakdownOf(mixedDoc(), ['2026-03'], 'kind');
    expect(view.rows.map((row) => row.key)).toEqual(['FIXED', 'ROUTINE', 'ONE_OFF']);
  });

  it('цвет привязан к виду, а не к месту в списке', () => {
    const full = breakdownOf(mixedDoc(), ['2026-03'], 'kind');
    const doc = mixedDoc();
    doc.fixedItems = [];
    const withoutFixed = breakdownOf(doc, ['2026-03'], 'kind');
    const routine = (view: ReturnType<typeof breakdownOf>): string =>
      view.rows.find((row) => row.key === 'ROUTINE')!.color;
    expect(routine(withoutFixed)).toBe(routine(full));
  });

  it('пустой вид не рисуется нулевым сектором', () => {
    const doc = emptyDoc();
    doc.expenses = [expense('2026-03-02', R(2000), 'c-food')];
    const view = breakdownOf(doc, ['2026-03'], 'kind');
    expect(view.rows.map((row) => row.key)).toEqual(['ROUTINE']);
  });

  it('оба разреза дают один и тот же итог', () => {
    const byCategory = breakdownOf(mixedDoc(), ['2026-03'], 'category');
    const byKind = breakdownOf(mixedDoc(), ['2026-03'], 'kind');
    expect(byKind.total).toBe(byCategory.total);
  });
});

// TODAY нужен только как напоминание: разрез месяца от сегодняшней даты не зависит
void TODAY;
