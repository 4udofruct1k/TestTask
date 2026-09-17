/**
 * Доход месяца. Открывается тапом по блоку бюджета на главной.
 *
 * Здесь же живёт удержание налога: это необязательная настройка позиции,
 * а не общее правило. Поля нет — вычета нет, сумма позиции и есть то,
 * что приходит.
 */

import { useState, type JSX } from 'react';
import { formatRub } from '../../domain/money';
import { DEFAULT_TAX_PERCENT, type MonthKey } from '../../domain/types';
import { activeAmountPeriod, fixedBlock, incomeExpenses, monthSummary, resolveFixed } from '../../engine';
import { useBudget } from '../../store/budget';
import { Sheet } from '../components/Sheet';
import { AmountChoiceSheet } from '../components/AmountChoiceSheet';
import { dayTitle, monthTitleLower } from '../format';
import { FixedItemForm } from './FixedItemForm';

interface Props {
  open: boolean;
  month: MonthKey;
  onClose(): void;
}

export function IncomeSheet({ open, month, onClose }: Props): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const changeFixedAmount = useBudget((s) => s.changeFixedAmount);
  const correctFixedAmount = useBudget((s) => s.correctFixedAmount);
  const setFixedTaxPercent = useBudget((s) => s.setFixedTaxPercent);

  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const block = fixedBlock(doc, month);
  const summary = monthSummary(doc, month, today);
  const income = resolveFixed(doc, month).filter((item) => item.kind === 'INCOME');
  const variable = incomeExpenses(doc, month);

  const editingItem = doc.fixedItems.find((f) => f.id === editing) ?? null;
  const editingPeriod = editingItem ? activeAmountPeriod(editingItem, month) : null;

  return (
    <>
      <Sheet open={open && editing === null && !adding} title={`Доход за ${monthTitleLower(month)}`} onClose={onClose}>
        <div className="detail-num">{formatRub(summary.totalIncome)}</div>
        <div className="detail-lab">
          {block.taxWithheld > 0
            ? `на руки · начислено ${formatRub(block.fixedIncomeGross + summary.variableIncome)}, удержано ${formatRub(block.taxWithheld)}`
            : 'приходит за месяц'}
        </div>

        {income.length === 0 && (
          <p className="hint">
            Постоянного дохода пока нет. Заведите зарплату — она считается одной суммой на месяц,
            дат внутри месяца у неё не бывает.
          </p>
        )}

        {income.map((item) => {
          const source = doc.fixedItems.find((f) => f.id === item.itemId);
          const editable = source?.mode === 'MONTHLY';
          return (
            <div className="card" style={{ marginTop: 10 }} key={item.itemId}>
              <div className="card-h">
                <div className="card-t">{item.title}</div>
                <div className="card-v">{formatRub(item.amount)}</div>
              </div>

              {item.tax > 0 ? (
                <p className="card-p">
                  Начислено <b>{formatRub(item.gross)}</b>, удержано {source?.taxPercent}% —{' '}
                  <b>{formatRub(item.tax)}</b>. В расчёты идёт то, что остаётся.
                </p>
              ) : (
                <p className="card-p">Приходит целиком, удержаний нет.</p>
              )}

              {item.overridden && <p className="hint">В этом месяце сумма задана разово.</p>}

              <TaxControl
                id={item.itemId}
                percent={source?.taxPercent ?? null}
                onChange={(value) => setFixedTaxPercent(item.itemId, value)}
              />

              {editable && (
                <button className="link" style={{ marginTop: 10 }} onClick={() => setEditing(item.itemId)}>
                  Изменить сумму <span>сейчас {formatRub(item.gross)}</span>
                </button>
              )}
            </div>
          );
        })}

        {variable.length > 0 && (
          <>
            <div className="eday" style={{ paddingTop: 16 }}>
              Разовые доходы
              <b>{formatRub(summary.variableIncome)}</b>
            </div>
            {variable.map((expense) => (
              <div className="sub-i" key={expense.id}>
                <span className="sub-n">
                  {doc.categories.find((c) => c.id === expense.categoryId)?.name ?? 'Прочее'}
                  <span className="sub-d">{dayTitle(expense.date)}</span>
                </span>
                <span className="sub-v">{formatRub(expense.amount)}</span>
              </div>
            ))}
            <p className="hint">
              Разовые доходы — обычные операции с датой, они правятся в истории. Удержание к ним
              не применяется.
            </p>
          </>
        )}

        <button className="save" onClick={() => setAdding(true)}>
          Добавить постоянный доход
        </button>
      </Sheet>

      {editingItem && editingPeriod && (
        <AmountChoiceSheet
          open={editing !== null}
          title={editingItem.title}
          current={editingPeriod.amount}
          effectiveMonth={month}
          currentPeriodMonth={editingPeriod.fromMonth}
          hint={
            editingItem.taxPercent !== undefined
              ? `Сумма до удержания. ${editingItem.taxPercent}% вычтется само.`
              : undefined
          }
          onForward={(amount) => changeFixedAmount(editingItem.id, month, amount)}
          onCorrect={(amount) => correctFixedAmount(editingItem.id, editingPeriod.fromMonth, amount)}
          onClose={() => setEditing(null)}
        />
      )}

      <FixedItemForm open={adding} mode="MONTHLY" initialKind="INCOME" onClose={() => setAdding(false)} />
    </>
  );
}

/** Переключатель удержания. По умолчанию выключен: вычет — возможность, а не правило. */
function TaxControl({
  id,
  percent,
  onChange,
}: {
  id: string;
  percent: number | null;
  onChange(value: number | null): void;
}): JSX.Element {
  const [raw, setRaw] = useState(String(percent ?? DEFAULT_TAX_PERCENT));
  const parsed = Number(raw);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 99;

  return (
    <>
      <div className="flowtog" role="group" aria-label="Удержание налога">
        <button aria-pressed={percent === null} onClick={() => onChange(null)}>
          Без вычета
        </button>
        <button
          aria-pressed={percent !== null}
          onClick={() => onChange(valid ? parsed : DEFAULT_TAX_PERCENT)}
        >
          Удерживать {valid ? parsed : DEFAULT_TAX_PERCENT}%
        </button>
      </div>

      {percent !== null && (
        <div className="field">
          <label htmlFor={`tax-${id}`}>Ставка, %</label>
          <input
            id={`tax-${id}`}
            inputMode="numeric"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              const next = Number(e.target.value);
              if (Number.isInteger(next) && next >= 1 && next <= 99) onChange(next);
            }}
          />
          <p className="hint">НДФЛ — 13%. Для самозанятости бывает 4 или 6.</p>
        </div>
      )}
    </>
  );
}
