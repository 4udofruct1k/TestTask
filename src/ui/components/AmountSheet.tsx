/** Ввод одной суммы. Используется настройками и экраном накоплений. */

import { useEffect, useState, type JSX } from 'react';
import { formatAmountExact, parseAmount } from '../../domain/money';
import type { Money } from '../../domain/types';
import { Sheet } from './Sheet';

interface Props {
  open: boolean;
  title: string;
  label: string;
  hint?: string;
  initial: Money;
  /** Ноль допустим: например, накоплений к началу учёта могло не быть */
  allowZero?: boolean;
  onSave(amount: Money): void;
  onClose(): void;
}

export function AmountSheet({
  open,
  title,
  label,
  hint,
  initial,
  allowZero,
  onSave,
  onClose,
}: Props): JSX.Element {
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (open) setRaw(initial === 0 ? '' : formatAmountExact(initial).replace(/ /g, ''));
  }, [open, initial]);

  const amount = parseAmount(raw);
  const valid = amount !== null && (allowZero ? amount >= 0 : amount > 0);

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="field">
        <label htmlFor="amount-sheet">{label}</label>
        <input
          id="amount-sheet"
          inputMode="decimal"
          value={raw}
          placeholder="0"
          onChange={(e) => setRaw(e.target.value)}
        />
      </div>
      {hint && <p className="hint">{hint}</p>}
      <button
        className="save"
        disabled={!valid}
        onClick={() => {
          if (amount === null) return;
          onSave(amount);
          onClose();
        }}
      >
        Сохранить
      </button>
    </Sheet>
  );
}
