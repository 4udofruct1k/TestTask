/**
 * Категории: список, правка, своя категория со значком. Раздел 3.8.
 *
 * Удаления здесь нет и быть не может: на категорию ссылается история
 * (1.2, инвариант 3). Вместо него архив — категория уходит из ввода,
 * но прошлые месяцы считаются как считались.
 */

import { useEffect, useState, type JSX } from 'react';
import { isCategoryNameTaken, isCategoryNameValid, MAX_CATEGORY_NAME } from '../../domain/categories';
import type { Category, Flow, Kind } from '../../domain/types';
import { useBudget } from '../../store/budget';
import { Sheet } from '../components/Sheet';

/** Значки на выбор. Набор бытовой: в него должно попадать большинство трат. */
const ICONS = [
  '🛒', '🍎', '🥖', '☕', '🍕', '🍺',
  '🚌', '🚗', '⛽', '🚕', '🚲', '✈️',
  '🏠', '💡', '🔧', '🧺', '🧴', '🪴',
  '📱', '💻', '🎧', '🔁', '📶', '🖨️',
  '💊', '🩺', '🦷', '🏋️', '🧘', '💇',
  '👕', '👟', '👜', '💄', '🧸', '🎁',
  '🎬', '🎮', '🎫', '📚', '🎸', '⚽',
  '🐾', '👶', '🎓', '💼', '🧾', '🏦',
  '💰', '🏅', '💵', '📈', '🤝', '🏷️',
];

const FALLBACK_ICON = '🏷️';

/** Первый символ как его видит человек: эмодзи бывает из нескольких кодовых точек. */
function firstIcon(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') return '';
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    const [first] = new Segmenter('ru', { granularity: 'grapheme' }).segment(trimmed);
    if (first) return first.segment;
  }
  return [...trimmed][0] ?? '';
}

interface Draft {
  /** null — новая категория */
  id: string | null;
  name: string;
  kind: Kind;
  defaultFlow: Flow;
  icon: string;
}

const NEW_DRAFT: Draft = { id: null, name: '', kind: 'EXPENSE', defaultFlow: 'ROUTINE', icon: '🛒' };

const draftOf = (category: Category): Draft => ({
  id: category.id,
  name: category.name,
  kind: category.kind,
  defaultFlow: category.defaultFlow,
  icon: category.icon,
});

function kindLabel(category: Category): string {
  if (category.kind === 'INCOME') return 'доход';
  return category.defaultFlow === 'ROUTINE' ? 'рутина' : 'разовое';
}

export function CategoriesSheet({ open, onClose }: { open: boolean; onClose(): void }): JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null);

  // Шторка закрылась — правка не должна ждать внутри до следующего открытия
  useEffect(() => {
    if (!open) setDraft(null);
  }, [open]);

  const title = draft === null ? 'Категории' : draft.id === null ? 'Новая категория' : 'Категория';

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {draft === null ? (
        <CategoryList onEdit={(category) => setDraft(draftOf(category))} onNew={() => setDraft(NEW_DRAFT)} />
      ) : (
        <CategoryForm draft={draft} onChange={setDraft} onDone={() => setDraft(null)} />
      )}
    </Sheet>
  );
}

function CategoryList({
  onEdit,
  onNew,
}: {
  onEdit(category: Category): void;
  onNew(): void;
}): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const restoreCategory = useBudget((s) => s.restoreCategory);

  const active = doc.categories.filter((c) => !c.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = doc.categories.filter((c) => c.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const expenses = active.filter((c) => c.kind === 'EXPENSE');
  const incomes = active.filter((c) => c.kind === 'INCOME');

  return (
    <>
      <button className="save" onClick={onNew}>
        Новая категория
      </button>

      <div className="field">
        <label>Траты</label>
        {expenses.map((category) => (
          <CategoryRow key={category.id} category={category} onClick={() => onEdit(category)} />
        ))}
      </div>

      <div className="field">
        <label>Доходы</label>
        {incomes.map((category) => (
          <CategoryRow key={category.id} category={category} onClick={() => onEdit(category)} />
        ))}
      </div>

      {archived.length > 0 && (
        <div className="field">
          <label>Убранные</label>
          {archived.map((category) => (
            <div className="catrow" key={category.id}>
              <span className="catrow-i">{category.icon}</span>
              <span className="catrow-n">{category.name}</span>
              <button className="sub-more" style={{ width: 'auto' }} onClick={() => restoreCategory(category.id)}>
                Вернуть
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="hint">
        Вид траты — подсказка при вводе: в самой трате он переключается. Убранная категория пропадает
        из ввода, но прошлые месяцы с ней считаются как считались.
      </p>
    </>
  );
}

function CategoryRow({ category, onClick }: { category: Category; onClick(): void }): JSX.Element {
  return (
    <button className="catrow catrow-btn" onClick={onClick}>
      <span className="catrow-i">{category.icon}</span>
      <span className="catrow-n">{category.name}</span>
      <span className="catrow-d">{kindLabel(category)}</span>
    </button>
  );
}

function CategoryForm({
  draft,
  onChange,
  onDone,
}: {
  draft: Draft;
  onChange(draft: Draft): void;
  onDone(): void;
}): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const addCategory = useBudget((s) => s.addCategory);
  const updateCategory = useBudget((s) => s.updateCategory);
  const archiveCategory = useBudget((s) => s.archiveCategory);
  const [custom, setCustom] = useState('');

  const icon = firstIcon(draft.icon) || FALLBACK_ICON;
  const taken = isCategoryNameTaken(doc.categories, draft.kind, draft.name, draft.id ?? undefined);
  const valid = isCategoryNameValid(doc.categories, draft.kind, draft.name, draft.id ?? undefined);

  const save = (): void => {
    if (draft.id === null) {
      addCategory({
        name: draft.name,
        kind: draft.kind,
        essential: false,
        defaultFlow: draft.defaultFlow,
        icon,
        // Цвет категории в интерфейсе не рисуется, но поле обязательное: берём цвет темы
        color: '#6B7A70',
      });
    } else {
      updateCategory(draft.id, { name: draft.name, icon, defaultFlow: draft.defaultFlow });
    }
    onDone();
  };

  return (
    <>
      <div className="field">
        <label htmlFor="cname">Название</label>
        <input
          id="cname"
          value={draft.name}
          maxLength={MAX_CATEGORY_NAME}
          placeholder="Например, бензин"
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        {taken && <p className="hint">Такая категория уже есть.</p>}
      </div>

      <div className="field">
        <label>Значок — сейчас {icon}</label>
        <div className="emoji-grid">
          {ICONS.map((option) => (
            <button
              key={option}
              className="emoji"
              aria-pressed={icon === option}
              aria-label={option}
              onClick={() => {
                setCustom('');
                onChange({ ...draft, icon: option });
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="cicon">Или свой значок</label>
        <input
          id="cicon"
          value={custom}
          placeholder={icon}
          onChange={(e) => {
            // В поле остаётся ровно то, что пойдёт в категорию: один символ
            const picked = firstIcon(e.target.value);
            setCustom(picked);
            if (picked !== '') onChange({ ...draft, icon: picked });
          }}
        />
      </div>

      {draft.id === null && (
        <div className="field">
          <label>Куда записывать</label>
          <div className="flowtog">
            <button
              aria-pressed={draft.kind === 'EXPENSE'}
              onClick={() => onChange({ ...draft, kind: 'EXPENSE' })}
            >
              Трата
            </button>
            <button
              aria-pressed={draft.kind === 'INCOME'}
              onClick={() => onChange({ ...draft, kind: 'INCOME' })}
            >
              Доход
            </button>
          </div>
        </div>
      )}

      {draft.kind === 'EXPENSE' && (
        <div className="field">
          <label>Вид траты по умолчанию</label>
          <div className="flowtog">
            <button
              aria-pressed={draft.defaultFlow === 'ROUTINE'}
              onClick={() => onChange({ ...draft, defaultFlow: 'ROUTINE' })}
            >
              Рутина
            </button>
            <button
              aria-pressed={draft.defaultFlow === 'ONE_OFF'}
              onClick={() => onChange({ ...draft, defaultFlow: 'ONE_OFF' })}
            >
              Разовое
            </button>
          </div>
        </div>
      )}

      <button className="save" disabled={!valid} onClick={save}>
        Сохранить
      </button>

      {draft.id !== null && (
        <button
          className="sub-more"
          style={{ marginTop: 10 }}
          onClick={() => {
            archiveCategory(draft.id!);
            onDone();
          }}
        >
          Убрать из списка
        </button>
      )}

      <button className="sub-more" style={{ marginTop: 10 }} onClick={onDone}>
        Назад к списку
      </button>

      {draft.id !== null && (
        <p className="hint">
          Направление у готовой категории не меняется: траты и доходы считаются по-разному, и прошлые
          месяцы пересобрались бы задним числом.
        </p>
      )}
    </>
  );
}
