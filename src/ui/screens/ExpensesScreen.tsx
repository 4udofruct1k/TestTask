/**
 * Расходы. Раздел 3.3: одна страница, две вкладки.
 * Разносить их по разным пунктам меню незачем — это одно дело.
 */

import { useState, type JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatRub } from '../../domain/money';
import type { Flow, Kind } from '../../domain/types';
import { expensesOfMonth, flowOf, resolveFixed } from '../../engine';
import { useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { TopBar } from '../components/TopBar';
import { IconPlus } from '../icons';
import { ContributionForm } from './ContributionForm';
import { FixedItemForm } from './FixedItemForm';
import { HistoryTab } from './HistoryTab';
import { QuickEntrySheet } from './QuickEntrySheet';

type Panel = 'oneOff' | 'routine' | 'income' | 'monthly' | 'spread' | 'contribution';

/** Сплошным выделены два ежедневных действия, контурным — то, что заводится раз и надолго. */
const PANELS: { id: Panel; title: string; subtitle: string; ghost: boolean }[] = [
  { id: 'oneOff', title: 'Разовая трата', subtitle: 'То, что не повторяется изо дня в день', ghost: false },
  { id: 'routine', title: 'Рутинная трата', subtitle: 'Продукты, транспорт, кофе', ghost: false },
  { id: 'income', title: 'Разовый доход', subtitle: 'Продали, вернули долг, премия', ghost: true },
  { id: 'monthly', title: 'Постоянный платёж', subtitle: 'Аренда, связь, подписки', ghost: true },
  { id: 'spread', title: 'Годовой платёж', subtitle: 'Страховка, налог — разложится по месяцам', ghost: true },
  { id: 'contribution', title: 'В копилку', subtitle: 'Отложить на конкретное', ghost: true },
];

export function ExpensesScreen(): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const { tab, setTab, filter, go, month: selected } = useUi();
  const month = selected ?? monthKeyOf(today);

  const [panel, setPanel] = useState<Panel | null>(null);

  const total = totalForFilter(doc, month, filter);

  return (
    <section className="pane">
      <TopBar
        title="Расходы"
        sub={tab === 'history' ? formatRub(total) : ''}
        onBack={() => go('home')}
      />

      <div className="tabs" role="group">
        <button aria-pressed={tab === 'add'} onClick={() => setTab('add')}>
          Добавить
        </button>
        <button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
          История
        </button>
      </div>

      {tab === 'add' ? (
        // Прокрутки здесь нет: выбор из шести пунктов не должен требовать мотания
        <div className="noscroll">
          <div className="addlist">
            {PANELS.map((item) => (
              <button
                key={item.id}
                className={`add${item.ghost ? ' ghost' : ''}`}
                onClick={() => setPanel(item.id)}
              >
                <span className="ic">
                  <IconPlus />
                </span>
                <span className="add-txt">
                  <span className="add-t">{item.title}</span>
                  <span className="add-s">{item.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <HistoryTab month={month} />
      )}

      <QuickEntrySheet
        open={panel === 'oneOff' || panel === 'routine' || panel === 'income'}
        kind={(panel === 'income' ? 'INCOME' : 'EXPENSE') as Kind}
        initialFlow={(panel === 'oneOff' ? 'ONE_OFF' : 'ROUTINE') as Flow}
        onClose={() => setPanel(null)}
      />
      <FixedItemForm open={panel === 'monthly'} mode="MONTHLY" onClose={() => setPanel(null)} />
      <FixedItemForm open={panel === 'spread'} mode="SPREAD" onClose={() => setPanel(null)} />
      <ContributionForm open={panel === 'contribution'} onClose={() => setPanel(null)} />
    </section>
  );
}

function totalForFilter(
  doc: Parameters<typeof resolveFixed>[0],
  month: string,
  filter: 'all' | 'fixed' | 'routine' | 'oneOff',
): number {
  const fixed = resolveFixed(doc, month)
    .filter((item) => item.kind === 'EXPENSE')
    .reduce((sum, item) => sum + item.amount, 0);

  const variable = expensesOfMonth(doc, month).reduce((sum, expense) => {
    const flow = flowOf(doc, expense);
    if (filter === 'routine') return sum + (flow === 'ROUTINE' ? expense.amount : 0);
    if (filter === 'oneOff') return sum + (flow === 'ONE_OFF' ? expense.amount : 0);
    if (filter === 'fixed') return sum;
    return sum + (flow === null ? 0 : expense.amount);
  }, 0);

  if (filter === 'fixed') return fixed;
  if (filter === 'all') return fixed + variable;
  return variable;
}
