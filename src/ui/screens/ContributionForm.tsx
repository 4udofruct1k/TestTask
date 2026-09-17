/**
 * Взнос в копилку. Взнос — не трата: net он не уменьшает (1.7).
 */

import { useEffect, useState, type JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatRub, parseAmount } from '../../domain/money';
import { contributionsOfMonth, monthSummary } from '../../engine';
import { useBudget } from '../../store/budget';
import { Sheet } from '../components/Sheet';

interface Props {
  open: boolean;
  onClose(): void;
  goalId?: string;
}

export function ContributionForm({ open, onClose, goalId }: Props): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const addContribution = useBudget((s) => s.addContribution);
  const month = monthKeyOf(today);

  const active = doc.goals.filter((g) => !g.archived);
  const [selected, setSelected] = useState(goalId ?? active[0]?.id ?? '');
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(goalId ?? active[0]?.id ?? '');
    setRaw('');
  }, [open, goalId, active]);

  const amount = parseAmount(raw);
  const valid = amount !== null && amount > 0 && selected !== '';

  // Сумма взносов за месяц может превышать net — это законно, но подсвечивается
  const exceeds =
    amount !== null && contributionsOfMonth(doc.goals, month) + amount > monthSummary(doc, month, today).net;

  if (active.length === 0) {
    return (
      <Sheet open={open} title="В копилку" onClose={onClose}>
        <p className="hint">Сначала заведите копилку на экране «Накопления».</p>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} title="В копилку" onClose={onClose}>
      <div className="field">
        <label htmlFor="cgoal">Копилка</label>
        <select id="cgoal" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {active.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="camount">Сумма</label>
        <input id="camount" inputMode="decimal" value={raw} placeholder="0" onChange={(e) => setRaw(e.target.value)} />
      </div>

      {exceeds && amount !== null && (
        <p className="hint">
          Больше, чем осталось от этого месяца ({formatRub(monthSummary(doc, month, today).net)}).
          Это нормально: деньги берутся из накопленного раньше.
        </p>
      )}

      <button
        className="save"
        disabled={!valid}
        onClick={() => {
          if (!valid || amount === null) return;
          addContribution(selected, month, amount);
          onClose();
        }}
      >
        Внести
      </button>
    </Sheet>
  );
}
