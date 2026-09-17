/**
 * Шторка быстрого ввода. Раздел 3.3.
 *
 * Типичная трата вносится двумя действиями: сумма и чип категории.
 *
 * Той же шторкой вносится разовый доход — продали что-то, вернули долг,
 * премия мимо зарплаты. Отдельной сущности для него нет: это операция
 * с категорией направления INCOME (1.3). Переключателя вида потока
 * у дохода нет — у него поток не определён (1.3, инвариант 6).
 */

import { useEffect, useMemo, useState, type JSX } from 'react';
import { flowToStore } from '../../domain/flow';
import { formatAmountExact, parseAmount } from '../../domain/money';
import type { Flow, Kind } from '../../domain/types';
import { useBudget } from '../../store/budget';
import { Sheet } from '../components/Sheet';
import { dayTitle } from '../format';
import { shiftDays } from '../clock';

interface Props {
  open: boolean;
  /** Трата или доход: от этого зависят чипы, заголовок и наличие переключателя */
  kind: Kind;
  /** Предустановленный вид потока: с какой панели пришли. У дохода не используется */
  initialFlow: Flow;
  onClose(): void;
}

export function QuickEntrySheet({ open, kind, initialFlow, onClose }: Props): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const addExpense = useBudget((s) => s.addExpense);
  const findRecentDuplicate = useBudget((s) => s.findRecentDuplicate);

  const [raw, setRaw] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow>(initialFlow);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [allChips, setAllChips] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRaw('');
    setCategoryId(null);
    setFlow(initialFlow);
    setDate(today);
    setNote('');
    setNoteOpen(false);
    setConfirmDuplicate(false);
    setAllChips(false);
  }, [open, initialFlow, today, kind]);

  /** Чипы категорий по частоте за 30 дней. */
  const chips = useMemo(() => {
    const since = shiftDays(today, -30);
    const counts = new Map<string, number>();
    for (const expense of doc.expenses) {
      if (expense.date < since) continue;
      counts.set(expense.categoryId, (counts.get(expense.categoryId) ?? 0) + 1);
    }
    return doc.categories
      .filter((c) => c.kind === kind && !c.archived)
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.sortOrder - b.sortOrder);
  }, [doc, today, kind]);

  const category = chips.find((c) => c.id === categoryId) ?? null;

  // Первыми идут восемь самых частых, остальные — по кнопке «Ещё». Иначе
  // своя категория, у которой ещё нет истории, не показывается никогда
  const head = chips.slice(0, 8);
  const visibleChips = allChips
    ? chips
    : category && !head.includes(category)
      ? [...head, category]
      : head;
  const amount = parseAmount(raw);
  const valid = amount !== null && amount > 0 && category !== null;

  // Вид потока берётся с панели, с которой пришли, и меняется только тапом
  // по переключателю. Подсказка категории его не перебивает: выбор панели —
  // заявление пользователя, а defaultFlow — догадка, и догадка тут не главнее.
  // Иначе «разовая трата» в категории «Кафе» молча становилась бы рутиной,
  // хотя это ровно тот случай из 1.2, ради которого поток и переопределяют.

  const submit = (): void => {
    if (!valid || !category) return;
    if (!confirmDuplicate && findRecentDuplicate(amount, category.id)) {
      setConfirmDuplicate(true);
      return;
    }
    // Поле заполняется, только когда подсказка категории переопределена (1.3)
    const stored = flowToStore(flow, category);
    addExpense({
      date,
      amount,
      categoryId: category.id,
      ...(stored ? { flow: stored } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      title={
        kind === 'INCOME' ? 'Разовый доход' : initialFlow === 'ONE_OFF' ? 'Разовая трата' : 'Рутинная трата'
      }
      onClose={onClose}
    >
      <input
        className="amount-input"
        inputMode="decimal"
        autoFocus
        placeholder="0"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setConfirmDuplicate(false);
        }}
        aria-label="Сумма"
      />

      <div className="chips">
        {visibleChips.map((c) => (
          <button
            key={c.id}
            className={`chip${c.id === categoryId ? ' sel' : ''}`}
            onClick={() => setCategoryId(c.id)}
          >
            {c.icon} {c.name}
          </button>
        ))}
        {chips.length > head.length && (
          <button className="chip chip-more" onClick={() => setAllChips(!allChips)}>
            {allChips ? 'Свернуть' : 'Ещё'}
          </button>
        )}
      </div>

      {kind === 'EXPENSE' ? (
        <div className="flowtog" role="group" aria-label="Вид траты">
          <button aria-pressed={flow === 'ROUTINE'} onClick={() => setFlow('ROUTINE')}>
            Рутина
          </button>
          <button aria-pressed={flow === 'ONE_OFF'} onClick={() => setFlow('ONE_OFF')}>
            Разовое
          </button>
        </div>
      ) : (
        <p className="hint">
          Доход войдёт в бюджет этого месяца целиком. Зарплату сюда вносить не нужно — она
          постоянный доход и считается сама.
        </p>
      )}

      <div className="field">
        <label htmlFor="qdate">Дата</label>
        <input id="qdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {date !== today && <p className="hint">{dayTitle(date)}</p>}
      </div>

      {noteOpen ? (
        <div className="field">
          <label htmlFor="qnote">Заметка</label>
          <input id="qnote" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </div>
      ) : (
        <button className="sub-more" onClick={() => setNoteOpen(true)}>
          Добавить заметку
        </button>
      )}

      {confirmDuplicate && (
        <p className="hint">
          Две минуты назад уже была такая же запись на {formatAmountExact(amount ?? 0)} ₽ в этой категории.
          Нажмите «Сохранить» ещё раз, если это не дубль.
        </p>
      )}

      <button className="save" disabled={!valid} onClick={submit}>
        {confirmDuplicate ? 'Всё равно сохранить' : 'Сохранить'}
      </button>
    </Sheet>
  );
}
