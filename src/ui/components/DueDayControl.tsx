/**
 * Число месяца у постоянной позиции. Разделы 1.4 и 3.4.
 *
 * Поле необязательное: пустое значит «число не задано», и позиция ведёт
 * себя как раньше — входит в месяц целиком и в расписание не попадает.
 */

import { useState, type JSX } from 'react';

interface Props {
  id: string;
  day: number | null;
  hint: string;
  onChange(day: number | null): void;
}

export function DueDayControl({ id, day, hint, onChange }: Props): JSX.Element {
  const [raw, setRaw] = useState(day === null ? '' : String(day));

  return (
    <div className="field">
      <label htmlFor={`due-${id}`}>Число месяца</label>
      <input
        id={`due-${id}`}
        inputMode="numeric"
        value={raw}
        placeholder="не задано"
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          if (next.trim() === '') {
            onChange(null);
            return;
          }
          const parsed = Number(next);
          if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 31) onChange(parsed);
        }}
      />
      <p className="hint">{hint}</p>
    </div>
  );
}
