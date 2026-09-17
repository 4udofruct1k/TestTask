/**
 * Правка суммы. Раздел 3.4.
 *
 * Пользователь выбирает между смыслами, а не между режимами, поэтому
 * формулировки именно такие и слова «редактировать» здесь нет.
 * Тот же диалог используется для цели по накоплению в настройках.
 */

import { useEffect, useState, type JSX } from 'react';
import { formatAmountExact, parseAmount } from '../../domain/money';
import type { Money, MonthKey } from '../../domain/types';
import { Sheet } from './Sheet';
import { fromMonthPhrase, monthGenitive } from '../format';

type Meaning = 'FORWARD' | 'CORRECT';

interface Props {
  open: boolean;
  title: string;
  current: Money;
  /** Месяц, с которого подействует правка вперёд */
  effectiveMonth: MonthKey;
  /** Месяц записи, которую правит «исправить ошибку» */
  currentPeriodMonth: MonthKey;
  onForward(amount: Money): void;
  onCorrect(amount: Money): void;
  onClose(): void;
}

export function AmountChoiceSheet({
  open,
  title,
  current,
  effectiveMonth,
  currentPeriodMonth,
  onForward,
  onCorrect,
  onClose,
}: Props): JSX.Element {
  const [meaning, setMeaning] = useState<Meaning>('FORWARD');
  const [raw, setRaw] = useState('');

  useEffect(() => {
    if (!open) return;
    setMeaning('FORWARD');
    setRaw(formatAmountExact(current).replace(/ /g, ''));
  }, [open, current]);

  const amount = parseAmount(raw);
  const valid = amount !== null && amount > 0;

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="field">
        <label htmlFor="acamount">Сумма</label>
        <input id="acamount" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />
      </div>

      <button className="choice" aria-pressed={meaning === 'FORWARD'} onClick={() => setMeaning('FORWARD')}>
        <b>Изменить {fromMonthPhrase(effectiveMonth)}</b>
        <span>Прошлые месяцы останутся с прежней суммой, статистика не переписывается.</span>
      </button>

      <button className="choice" aria-pressed={meaning === 'CORRECT'} onClick={() => setMeaning('CORRECT')}>
        <b>Исправить ошибку</b>
        <span>
          Правится запись, действующая с {monthGenitive(currentPeriodMonth)}. Это пересчитает уже
          закрытые месяцы.
        </span>
      </button>

      <button
        className="save"
        disabled={!valid}
        onClick={() => {
          if (amount === null) return;
          if (meaning === 'FORWARD') onForward(amount);
          else onCorrect(amount);
          onClose();
        }}
      >
        Сохранить
      </button>
    </Sheet>
  );
}
