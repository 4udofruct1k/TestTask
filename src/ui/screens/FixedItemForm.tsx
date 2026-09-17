/**
 * Формы постоянного и годового платежа. Разделы 1.4 и 3.3.
 */

import { useEffect, useState, type JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatRub, parseAmount } from '../../domain/money';
import type { Kind, MonthKey } from '../../domain/types';
import { useBudget } from '../../store/budget';
import { Sheet } from '../components/Sheet';
import { monthGenitive } from '../format';

/** Пресеты из 1.4: считать месяцы руками пользователь не должен. */
const PRESETS: { label: string; months: number }[] = [
  { label: 'Раз в год', months: 12 },
  { label: 'Раз в полгода', months: 6 },
  { label: 'Раз в квартал', months: 3 },
];

interface Props {
  open: boolean;
  mode: 'MONTHLY' | 'SPREAD';
  onClose(): void;
}

export function FixedItemForm({ open, mode, onClose }: Props): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const addFixedMonthly = useBudget((s) => s.addFixedMonthly);
  const addFixedSpread = useBudget((s) => s.addFixedSpread);
  const month = monthKeyOf(today);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('EXPENSE');
  const [categoryId, setCategoryId] = useState('');
  const [raw, setRaw] = useState('');
  const [fromMonth, setFromMonth] = useState<MonthKey>(month);
  const [months, setMonths] = useState(12);
  const [customMonths, setCustomMonths] = useState('');
  const [payMonth, setPayMonth] = useState<MonthKey>(month);
  const [payDay, setPayDay] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setKind('EXPENSE');
    setCategoryId('');
    setRaw('');
    setFromMonth(month);
    setMonths(12);
    setCustomMonths('');
    setPayMonth(month);
    setPayDay('');
  }, [open, month]);

  const categories = doc.categories.filter((c) => !c.archived && (mode === 'SPREAD' ? c.kind === 'EXPENSE' : c.kind === kind));
  const amount = parseAmount(raw);
  const valid = title.trim() !== '' && categoryId !== '' && amount !== null && amount > 0 && (mode === 'MONTHLY' || months >= 2);

  const submit = (): void => {
    if (!valid || amount === null) return;
    if (mode === 'MONTHLY') {
      addFixedMonthly({ title: title.trim(), kind, categoryId, amount, fromMonth });
    } else {
      addFixedSpread({
        title: title.trim(),
        categoryId,
        totalAmount: amount,
        months,
        fromMonth,
        payMonth,
        ...(payDay ? { payDay: Number(payDay) } : {}),
      });
    }
    onClose();
  };

  const share = amount !== null && months >= 2 ? Math.floor(amount / months) : null;

  return (
    <Sheet open={open} title={mode === 'MONTHLY' ? 'Постоянный платёж' : 'Годовой платёж'} onClose={onClose}>
      <div className="field">
        <label htmlFor="ftitle">Название</label>
        <input
          id="ftitle"
          value={title}
          maxLength={40}
          placeholder={mode === 'MONTHLY' ? 'Аренда' : 'Страховка'}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {mode === 'MONTHLY' && (
        <div className="flowtog" role="group" aria-label="Направление">
          <button aria-pressed={kind === 'EXPENSE'} onClick={() => { setKind('EXPENSE'); setCategoryId(''); }}>
            Расход
          </button>
          <button aria-pressed={kind === 'INCOME'} onClick={() => { setKind('INCOME'); setCategoryId(''); }}>
            Доход
          </button>
        </div>
      )}

      <div className="field">
        <label htmlFor="fcat">Категория</label>
        <select id="fcat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Выберите</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="famount">{mode === 'MONTHLY' ? 'Сумма в месяц' : 'Сумма платежа целиком'}</label>
        <input id="famount" inputMode="decimal" value={raw} placeholder="0" onChange={(e) => setRaw(e.target.value)} />
      </div>

      {mode === 'SPREAD' && (
        <>
          <div className="field">
            <label>На сколько месяцев разложить</label>
            <div className="chips">
              {PRESETS.map((preset) => (
                <button
                  key={preset.months}
                  className={`chip${months === preset.months && customMonths === '' ? ' sel' : ''}`}
                  onClick={() => {
                    setMonths(preset.months);
                    setCustomMonths('');
                  }}
                >
                  {preset.label}
                </button>
              ))}
              <input
                style={{ width: 92 }}
                className="chip"
                inputMode="numeric"
                placeholder="своё"
                value={customMonths}
                onChange={(e) => {
                  setCustomMonths(e.target.value);
                  const value = Number(e.target.value);
                  if (Number.isInteger(value) && value >= 2) setMonths(value);
                }}
                aria-label="Своё число месяцев"
              />
            </div>
          </div>
          {share !== null && (
            <p className="hint">
              В бюджете это {formatRub(share)} в месяц. Когда реально заплатите, вносить ничего не нужно:
              трата уже учтена долями.
            </p>
          )}
          <div className="field">
            <label htmlFor="fpay">Месяц списания</label>
            <input id="fpay" type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} />
            <p className="hint">
              В расчётах не участвует — нужен календарю, чтобы день списания не застал врасплох.
            </p>
          </div>
          <div className="field">
            <label htmlFor="fpayday">День списания, если знаете</label>
            <input id="fpayday" inputMode="numeric" value={payDay} placeholder="1..31" onChange={(e) => setPayDay(e.target.value)} />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="ffrom">Действует с месяца</label>
        <input id="ffrom" type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} />
        <p className="hint">Позиция будет учитываться начиная с {monthGenitive(fromMonth)}.</p>
      </div>

      <button className="save" disabled={!valid} onClick={submit}>
        Сохранить
      </button>
    </Sheet>
  );
}
