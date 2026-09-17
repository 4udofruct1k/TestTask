/**
 * Карточка постоянной позиции. Раздел 3.4.
 */

import { useState, type JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatRub } from '../../domain/money';
import { activeAmountPeriod, activeSpreadPeriod, amountAt, grossAmountAt, wasActiveBefore } from '../../engine';
import { useBudget } from '../../store/budget';
import { Sheet } from '../components/Sheet';
import { AmountChoiceSheet } from '../components/AmountChoiceSheet';
import { months as monthsWord, monthTitleLower } from '../format';

interface Props {
  itemId: string | null;
  onClose(): void;
}

export function FixedItemCard({ itemId, onClose }: Props): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const changeFixedAmount = useBudget((s) => s.changeFixedAmount);
  const correctFixedAmount = useBudget((s) => s.correctFixedAmount);
  const eraseFixedItem = useBudget((s) => s.eraseFixedItem);
  const endFixedItem = useBudget((s) => s.endFixedItem);

  const [editing, setEditing] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);

  const month = monthKeyOf(today);
  const item = doc.fixedItems.find((f) => f.id === itemId) ?? null;
  const open = item !== null;

  if (!item) return <Sheet open={false} title="" onClose={onClose} children={null} />;

  const category = doc.categories.find((c) => c.id === item.categoryId);
  const share = amountAt(item, month);
  const grossShare = grossAmountAt(item, month);
  const monthlyPeriod = activeAmountPeriod(item, month);
  const spreadPeriod = activeSpreadPeriod(item, month);
  const periodMonth = monthlyPeriod?.fromMonth ?? spreadPeriod?.fromMonth ?? month;

  return (
    <>
      <Sheet open={open && !editing} title={item.title} onClose={onClose}>
        <div className="sub-i">
          <span className="sub-n">Категория</span>
          <span className="sub-v">
            {category?.icon} {category?.name ?? 'Прочее'}
          </span>
        </div>
        <div className="sub-i">
          <span className="sub-n">Направление</span>
          <span className="sub-v">{item.kind === 'INCOME' ? 'Доход' : 'Расход'}</span>
        </div>

        {item.mode === 'MONTHLY' ? (
          <>
            {item.taxPercent !== undefined && grossShare !== null && (
              <>
                <div className="sub-i">
                  <span className="sub-n">Начислено</span>
                  <span className="sub-v">{formatRub(grossShare)}</span>
                </div>
                <div className="sub-i">
                  <span className="sub-n">
                    Удержано
                    <span className="sub-d">{item.taxPercent}%</span>
                  </span>
                  <span className="sub-v">{formatRub(grossShare - (share ?? 0))}</span>
                </div>
              </>
            )}
            <div className="sub-i">
              <span className="sub-n">{item.taxPercent === undefined ? 'Сумма в месяц' : 'К выплате'}</span>
              <span className="sub-v">{share === null ? 'не действует' : formatRub(share)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="sub-i">
              <span className="sub-n">
                Сумма целиком
                <span className="sub-d">раз в {monthsWord(spreadPeriod?.months ?? 0)}</span>
              </span>
              <span className="sub-v">{spreadPeriod ? formatRub(spreadPeriod.totalAmount) : '—'}</span>
            </div>
            <div className="sub-i">
              <span className="sub-n">Доля месяца</span>
              <span className="sub-v">{share === null ? '—' : formatRub(share)}</span>
            </div>
          </>
        )}

        {item.endMonth && (
          <p className="hint">Позиция закрыта, последний месяц действия — {monthTitleLower(item.endMonth)}.</p>
        )}

        {item.mode === 'MONTHLY' && monthlyPeriod && (
          <button className="link" onClick={() => setEditing(true)}>
            Изменить сумму <span>сейчас {formatRub(monthlyPeriod.amount)}</span>
          </button>
        )}

        {!item.endMonth && (
          <button className="link" style={{ color: 'var(--alarm)' }} onClick={() => { endFixedItem(item.id, month); onClose(); }}>
            Больше не плачу <span>{wasActiveBefore(item, month) ? 'с этого месяца вперёд' : 'позиция удалится целиком'}</span>
          </button>
        )}

        {confirmErase ? (
          <>
            <p className="hint">
              Позиция исчезнет из всех прошлых месяцев. Накопления и графики за закрытые месяцы
              пересчитаются — это необратимо.
            </p>
            <button className="save" style={{ background: 'var(--alarm)' }} onClick={() => { eraseFixedItem(item.id); onClose(); }}>
              Стереть вместе с прошлым
            </button>
          </>
        ) : (
          <button className="sub-more" onClick={() => setConfirmErase(true)}>
            Исправить ошибку — стереть позицию вместе с прошлым
          </button>
        )}
      </Sheet>

      {monthlyPeriod && (
        <AmountChoiceSheet
          open={editing}
          title={item.title}
          current={monthlyPeriod.amount}
          effectiveMonth={month}
          currentPeriodMonth={periodMonth}
          onForward={(amount) => changeFixedAmount(item.id, month, amount)}
          onCorrect={(amount) => correctFixedAmount(item.id, periodMonth, amount)}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
