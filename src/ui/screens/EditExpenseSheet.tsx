/** Правка переменной операции: сумма, категория, дата, вид потока (3.3). */

import { useEffect, useState, type JSX } from 'react';
import { flowToStore } from '../../domain/flow';
import { formatAmountExact, parseAmount } from '../../domain/money';
import type { Expense, Flow } from '../../domain/types';
import { useBudget } from '../../store/budget';
import { Sheet } from '../components/Sheet';

interface Props {
  expense: Expense | null;
  onClose(): void;
}

export function EditExpenseSheet({ expense, onClose }: Props): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const updateExpense = useBudget((s) => s.updateExpense);

  const [raw, setRaw] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [flow, setFlow] = useState<Flow>('ROUTINE');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!expense) return;
    const category = doc.categories.find((c) => c.id === expense.categoryId);
    setRaw(formatAmountExact(expense.amount).replace(/ /g, ''));
    setCategoryId(expense.categoryId);
    setDate(expense.date);
    setFlow(expense.flow ?? category?.defaultFlow ?? 'ROUTINE');
    setNote(expense.note ?? '');
  }, [expense, doc]);

  if (!expense) return <Sheet open={false} title="" onClose={onClose} children={null} />;

  const category = doc.categories.find((c) => c.id === categoryId);
  const isIncome = category?.kind === 'INCOME';
  const amount = parseAmount(raw);
  const valid = amount !== null && amount > 0 && categoryId !== '';

  return (
    <Sheet open title="Изменить" onClose={onClose}>
      <div className="field">
        <label htmlFor="eamount">Сумма</label>
        <input id="eamount" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="ecat">Категория</label>
        <select id="ecat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {doc.categories
            .filter((c) => !c.archived || c.id === expense.categoryId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name} {c.kind === 'INCOME' ? '(доход)' : ''}
              </option>
            ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="edate">Дата</label>
        <input id="edate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {/* У доходов поток не определён и в расчётах не используется (1.3) */}
      {!isIncome && (
        <div className="flowtog" role="group" aria-label="Вид траты">
          <button aria-pressed={flow === 'ROUTINE'} onClick={() => setFlow('ROUTINE')}>
            Рутина
          </button>
          <button aria-pressed={flow === 'ONE_OFF'} onClick={() => setFlow('ONE_OFF')}>
            Разовое
          </button>
        </div>
      )}

      <div className="field">
        <label htmlFor="enote">Заметка</label>
        <input id="enote" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>

      <button
        className="save"
        disabled={!valid}
        onClick={() => {
          if (amount === null) return;
          updateExpense(expense.id, {
            amount,
            categoryId,
            date,
            note,
            // Поле хранится, только когда подсказка категории переопределена
            flow: flowToStore(flow, category),
          });
          onClose();
        }}
      >
        Сохранить
      </button>
    </Sheet>
  );
}
