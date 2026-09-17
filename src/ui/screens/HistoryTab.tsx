/**
 * Вкладка «История». Раздел 3.3.
 *
 * Постоянные идут отдельным блоком сверху без дат: это доля месяца,
 * а не трата конкретного дня. Разреза по категориям здесь нет —
 * категориям место в дашбордах, а список нужен для правки операции.
 */

import { useState, type JSX } from 'react';
import { compareDate, monthKeyOf } from '../../domain/dates';
import { formatAmount, formatRub } from '../../domain/money';
import type { Expense, Kind, MonthKey } from '../../domain/types';
import { expensesOfMonth, flowOf, hasSpreadItems, resolveFixed, type ResolvedFixed } from '../../engine';
import { useBudget } from '../../store/budget';
import { useUi, type HistoryFilter } from '../../store/ui';
import { dayTitle } from '../format';
import { EditExpenseSheet } from './EditExpenseSheet';
import { FixedItemCard } from './FixedItemCard';

const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'fixed', label: 'Постоянные' },
  { id: 'routine', label: 'Рутина' },
  { id: 'oneOff', label: 'Разовые' },
];

export function HistoryTab({ month }: { month: MonthKey }): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const removeExpense = useBudget((s) => s.removeExpense);
  const skipFixedMonth = useBudget((s) => s.skipFixedMonth);
  const endFixedItem = useBudget((s) => s.endFixedItem);
  const { filter, setFilter, go } = useUi();

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);

  const fixed = resolveFixed(doc, month);
  const showFixed = filter === 'all' || filter === 'fixed';
  const variable = expensesOfMonth(doc, month)
    .filter((expense) => {
      const flow = flowOf(doc, expense);
      if (filter === 'routine') return flow === 'ROUTINE';
      if (filter === 'oneOff') return flow === 'ONE_OFF';
      return filter !== 'fixed';
    })
    .slice()
    .sort((a, b) => compareDate(b.date, a.date) || (a.createdAt < b.createdAt ? 1 : -1));

  const byDay = groupByDay(variable);
  const isCurrentMonth = month === monthKeyOf(today);

  const fixedGroups = (
    [
      { kind: 'INCOME' as Kind, title: 'Постоянные доходы', items: fixed.filter((i) => i.kind === 'INCOME') },
      { kind: 'EXPENSE' as Kind, title: 'Постоянные расходы', items: fixed.filter((i) => i.kind === 'EXPENSE') },
    ] satisfies { kind: Kind; title: string; items: ResolvedFixed[] }[]
  ).filter((group) => group.items.length > 0);

  return (
    <>
      <div className="filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            className="f"
            aria-pressed={filter === item.id}
            onClick={() => {
              setFilter(item.id);
              setOpenRow(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="scroll">
        <div className="elist">
          {showFixed &&
            fixedGroups.map((group) => (
              <div key={group.kind}>
                <div className="eday">
                  {group.title}
                  <b>{formatRub(group.items.reduce((sum, item) => sum + item.amount, 0))}</b>
                </div>
                {group.items.map((item) => {
                  const id = `f:${item.itemId}`;
                  return (
                    <div className={`e fix${openRow === id ? ' open' : ''}`} key={id}>
                      <button className="e-main" onClick={() => setOpenRow(openRow === id ? null : id)}>
                        <span className="e-txt">
                          <span className="e-t">
                            {item.title}
                            {item.isReserve && <span className="tag f">годовой</span>}
                          </span>
                          <span className="e-s">
                            {item.isReserve ? 'доля годового платежа' : 'каждый месяц'}
                            {item.overridden ? ' · в этом месяце иначе' : ''}
                          </span>
                        </span>
                        <span className="e-v">{formatAmount(item.amount)}</span>
                      </button>
                      {openRow === id && (
                        <div className="e-act">
                          <button className="e-edit" onClick={() => setCardId(item.itemId)}>
                            Изменить
                          </button>
                          <button
                            className="e-skip"
                            onClick={() => {
                              skipFixedMonth(item.itemId, month);
                              setOpenRow(null);
                            }}
                          >
                            Пропустить
                          </button>
                          <button
                            className="e-del"
                            onClick={() => {
                              endFixedItem(item.itemId, month);
                              setOpenRow(null);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

          {showFixed && hasSpreadItems(doc, month) && (
            <button className="link" onClick={() => go('calendar')}>
              Календарь годовых <span>когда уйдут целиком</span>
            </button>
          )}

          {byDay.map(([day, list]) => (
            <div key={day}>
              <div className="eday">
                {dayTitle(day)}
                <b>{formatRub(list.reduce((sum, e) => sum + e.amount, 0))}</b>
              </div>
              {list.map((expense) => {
                const flow = flowOf(doc, expense);
                const category = doc.categories.find((c) => c.id === expense.categoryId);
                const id = `v:${expense.id}`;
                // Дата уже в заголовке дня, второй раз её не повторяем
                const note = [
                  compareDate(expense.date, today) > 0 ? 'запланировано' : null,
                  expense.note ?? null,
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ');
                return (
                  <div className={`e${openRow === id ? ' open' : ''}`} key={id}>
                    <button className="e-main" onClick={() => setOpenRow(openRow === id ? null : id)}>
                      <span className="e-txt">
                        <span className="e-t">
                          {category?.name ?? 'Прочее'}
                          <span className={`tag ${flow === 'ONE_OFF' ? 'o' : flow === 'ROUTINE' ? 'r' : 'f'}`}>
                            {flow === 'ONE_OFF' ? 'разовое' : flow === 'ROUTINE' ? 'рутина' : 'доход'}
                          </span>
                        </span>
                        {note !== '' && <span className="e-s">{note}</span>}
                      </span>
                      <span className="e-v">{formatAmount(expense.amount)}</span>
                    </button>
                    {openRow === id && (
                      <div className="e-act">
                        <button className="e-edit" onClick={() => setEditing(expense)}>
                          Изменить
                        </button>
                        <button
                          className="e-del"
                          onClick={() => {
                            removeExpense(expense.id);
                            setOpenRow(null);
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {byDay.length === 0 && (!showFixed || fixedGroups.length === 0) && (
            <div className="empty">
              <b>{isCurrentMonth ? 'В этом месяце пока пусто' : 'В этом месяце записей нет'}</b>
              Внесите первую трату — она появится здесь с датой и категорией.
            </div>
          )}
        </div>
      </div>

      <EditExpenseSheet expense={editing} onClose={() => setEditing(null)} />
      <FixedItemCard itemId={cardId} onClose={() => setCardId(null)} />
    </>
  );
}

function groupByDay(expenses: Expense[]): [string, Expense[]][] {
  const map = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const list = map.get(expense.date);
    if (list) list.push(expense);
    else map.set(expense.date, [expense]);
  }
  return [...map.entries()];
}
