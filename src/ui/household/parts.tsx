/**
 * Общие куски разделов дома: шапка, полоса дней, фишка продукта,
 * правка количества, строка сводки.
 */

import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from 'react';
import type { DateStr } from '../../household/days';
import { WEEK_KEYS, weekdayOf } from '../../household/days';
import type { Chip } from '../../household/plan';
import { useHousehold } from '../../store/household';
import { useUi, type Screen } from '../../store/ui';
import { IconBack } from '../icons';
import { changesWord, parseQty, syncedAt } from './format';

export function HBar({ title, sub, to = 'hub' }: { title: string; sub?: ReactNode; to?: Screen }): JSX.Element {
  const go = useUi((s) => s.go);
  return (
    <div className="h-bar">
      <button className="h-back" aria-label="Назад" onClick={() => go(to)}>
        <IconBack />
      </button>
      <h1>{title}</h1>
      {sub !== undefined && <span className="h-sub">{sub}</span>}
    </div>
  );
}

/** Цвет блюда дня — переменная из household.css. */
export const dishStyle = (dish: string): CSSProperties => ({ '--dish': `var(--dish-${dish})` }) as CSSProperties;

interface DayStripProps {
  week: DateStr[];
  selected: DateStr;
  today: DateStr;
  onSelect(date: DateStr): void;
  dishOf(date: DateStr): string;
  /** День без готовки — полоска бледнее */
  off(date: DateStr): boolean;
}

export function DayStrip({ week, selected, today, onSelect, dishOf, off }: DayStripProps): JSX.Element {
  return (
    <div className="h-days" role="group" aria-label="День недели">
      {week.map((date) => {
        const key = WEEK_KEYS[weekdayOf(date)];
        const isToday = date === today;
        return (
          <button
            key={date}
            className={`h-day${off(date) ? ' off' : ''}${isToday ? ' is-today' : ''}`}
            style={dishStyle(dishOf(date))}
            aria-pressed={date === selected}
            aria-label={isToday ? `${key}, сегодня` : key}
            onClick={() => onSelect(date)}
          >
            <b>{key}</b>
            <i />
          </button>
        );
      })}
    </div>
  );
}

export function ChipView({ chip, wide }: { chip: Chip; wide?: boolean }): JSX.Element {
  return (
    <div className={`h-chip${chip.muted ? ' muted' : ''}${wide ? ' wide' : ''}`}>
      <span className="h-e" aria-hidden="true">
        {chip.e}
      </span>
      <span className="tx">
        <b>{chip.name}</b>
        {chip.amt && <small className="amt">{chip.amt}</small>}
        {chip.sub && <small>{chip.sub}</small>}
      </span>
    </div>
  );
}

interface QtyEditorProps {
  id: string;
  label: string;
  initial: number;
  unit: string;
  step: number;
  hint?: ReactNode;
  saveLabel?: string;
  onSave(value: number): void;
  onCancel(): void;
}

/** Поле количества с «−» и «+». В поле — итог, а не добавка. */
export function QtyEditor({ id, label, initial, unit, step, hint, saveLabel = 'Сохранить', onSave, onCancel }: QtyEditorProps): JSX.Element {
  const [text, setText] = useState(String(initial));
  const input = useRef<HTMLInputElement>(null);
  const value = parseQty(text);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const bump = (delta: number): void => {
    const base = parseQty(text) ?? 0;
    setText(String(Math.max(0, Math.round((base + delta) * 100) / 100)));
  };

  const save = (): void => {
    if (value !== null) onSave(value);
  };

  return (
    <div className="h-edit">
      <label htmlFor={id}>{label}</label>
      <div className="h-editline">
        <button className="h-step" aria-label="Меньше" onClick={() => bump(-step)}>
          −
        </button>
        <input
          id={id}
          ref={input}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={value === null}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <span className="unit">{unit}</span>
        <button className="h-step" aria-label="Больше" onClick={() => bump(step)}>
          +
        </button>
      </div>
      <div className="h-editline">
        <button className="h-save" disabled={value === null} onClick={save}>
          {saveLabel}
        </button>
        <button className="h-cancel" onClick={onCancel}>
          Отмена
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** Состояние сводки одной строкой. */
export function useSyncText(): { text: string; waiting: number; error: string | null; connected: boolean } {
  const local = useHousehold((s) => s.local);
  const syncing = useHousehold((s) => s.syncing);
  const waiting = local.outbox.length;
  const connected = local.sync !== null;
  let text: string;
  if (syncing) text = 'Сводим с облаком…';
  else if (!connected) text = waiting ? `${waiting} ${changesWord(waiting)} в телефоне · облако не подключено` : 'Облако не подключено';
  else if (local.lastError) text = local.lastError;
  else if (waiting) text = `${waiting} ${changesWord(waiting)} ждут сводки`;
  else if (local.lastSyncAt) text = `Сведено ${syncedAt(local.lastSyncAt, new Date())}`;
  else text = 'Ещё не сводились';
  return { text, waiting, error: syncing ? null : local.lastError, connected };
}

export function SyncLine(): JSX.Element {
  const syncing = useHousehold((s) => s.syncing);
  const syncNow = useHousehold((s) => s.syncNow);
  const go = useUi((s) => s.go);
  const { text, error, connected } = useSyncText();
  return (
    <div className="h-syncline">
      <span className={error ? 'err' : undefined}>{text}</span>
      {connected ? (
        <button disabled={syncing} onClick={() => void syncNow()}>
          {syncing ? 'Сводим…' : 'Обновить'}
        </button>
      ) : (
        <button onClick={() => go('household')}>Подключить</button>
      )}
    </div>
  );
}
