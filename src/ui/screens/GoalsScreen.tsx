/**
 * Цели. Раздел 3.7.
 *
 * Просроченная цель не удаляется и не прячется: показывается
 * с непройденной датой и предложением сдвинуть срок.
 */

import { useState, type JSX } from 'react';
import { addMonths, monthKeyOf } from '../../domain/dates';
import { formatAmount, formatRub, parseAmount } from '../../domain/money';
import type { SavingsGoal } from '../../domain/types';
import { contributionsOfMonth, goalProgress, isOverdue, monthSummary } from '../../engine';
import { useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { TopBar } from '../components/TopBar';
import { Sheet } from '../components/Sheet';
import { BarsChart, DETAIL_H } from '../charts';
import { months as monthsWord, monthGenitive, monthShort, monthTitleLower } from '../format';
import { ContributionForm } from './ContributionForm';

export function GoalsScreen(): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const addGoal = useBudget((s) => s.addGoal);
  const { go } = useUi();

  const [creating, setCreating] = useState(false);
  const [contributing, setContributing] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [raw, setRaw] = useState('');
  const [deadline, setDeadline] = useState('');

  const month = monthKeyOf(today);
  const active = doc.goals.filter((goal) => !goal.archived);
  const contributed = contributionsOfMonth(doc.goals, month);
  const net = monthSummary(doc, month, today).net;

  const amount = parseAmount(raw);
  const goal = active.find((g) => g.id === opened) ?? null;

  return (
    <section className="pane">
      <TopBar title="Цели" onBack={() => go('home')} />
      <div className="scroll">
        <div className="elist">
          {active.length === 0 && (
            <div className="empty">
              <b>Целей пока нет</b>
              Цель — это конкретная сумма на конкретное: новый компьютер, поездка.
              Взнос в цель не считается тратой.
            </div>
          )}

          {active.map((item) => {
            const progress = goalProgress(item, today);
            const overdue = isOverdue(item, today);
            return (
              <div className="goal" key={item.id}>
                <div className="goal-h">
                  <span className="goal-t">{item.title}</span>
                  <span className="goal-v">
                    {formatAmount(progress.saved)} из {formatAmount(item.targetAmount)}
                  </span>
                </div>
                <div className="track">
                  <i style={{ width: `${Math.min(100, progress.pct * 100)}%` }} />
                </div>
                <p className="card-p">
                  {progress.remaining === 0 ? (
                    <>Цель закрыта.</>
                  ) : overdue ? (
                    <>
                      Срок прошёл ({monthGenitive(item.deadline!)}), осталось{' '}
                      <b>{formatRub(progress.remaining)}</b>.{' '}
                      <button className="sub-more" onClick={() => setOpened(item.id)}>
                        Сдвинуть срок
                      </button>
                    </>
                  ) : progress.requiredPerMonth !== null ? (
                    <>
                      Осталось <b>{formatRub(progress.remaining)}</b>. Чтобы успеть за{' '}
                      {monthsWord(progress.monthsLeft ?? 0)}, нужно по{' '}
                      <b>{formatRub(progress.requiredPerMonth)}</b> в месяц.
                    </>
                  ) : (
                    <>
                      Осталось <b>{formatRub(progress.remaining)}</b>. Срок не задан
                      {progress.avgPerMonth !== null && progress.projectedMonths !== null ? (
                        <>
                          , по текущему темпу {formatRub(progress.avgPerMonth)} в месяц выйдет за{' '}
                          {monthsWord(Math.ceil(progress.projectedMonths))}
                        </>
                      ) : null}
                      .
                    </>
                  )}
                </p>
                <div className="e-act" style={{ padding: '10px 0 0' }}>
                  <button className="e-edit" onClick={() => setContributing(item.id)}>
                    Внести
                  </button>
                  <button className="e-skip" onClick={() => setOpened(item.id)}>
                    Подробнее
                  </button>
                </div>
              </div>
            );
          })}

          {contributed > net && contributed > 0 && (
            <p className="hint" style={{ padding: '0 2px' }}>
              Взносов за {monthTitleLower(month)} — {formatRub(contributed)}, а накопление месяца{' '}
              {formatRub(net)}. Это не ошибка: взнос покрыт накоплениями прошлых месяцев.
            </p>
          )}

          <button className="link" onClick={() => setCreating(true)}>
            Новая цель <span>накопить на конкретное</span>
          </button>
        </div>
      </div>

      <Sheet open={creating} title="Новая цель" onClose={() => setCreating(false)}>
        <div className="field">
          <label htmlFor="gtitle">Название</label>
          <input id="gtitle" value={title} maxLength={40} placeholder="Новый ПК" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="gamount">Сколько накопить</label>
          <input id="gamount" inputMode="decimal" value={raw} placeholder="0" onChange={(e) => setRaw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="gdeadline">Срок, если есть</label>
          <input id="gdeadline" type="month" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <button
          className="save"
          disabled={title.trim() === '' || amount === null || amount <= 0}
          onClick={() => {
            if (amount === null) return;
            addGoal({ title: title.trim(), targetAmount: amount, ...(deadline ? { deadline } : {}) });
            setTitle('');
            setRaw('');
            setDeadline('');
            setCreating(false);
          }}
        >
          Создать
        </button>
      </Sheet>

      <GoalDetail goal={goal} onClose={() => setOpened(null)} onContribute={() => { setOpened(null); setContributing(goal?.id ?? null); }} />
      <ContributionForm open={contributing !== null} goalId={contributing ?? undefined} onClose={() => setContributing(null)} />
    </section>
  );
}

/** Экран цели: график взносов по месяцам, фактический темп против требуемого. */
function GoalDetail({
  goal,
  onClose,
  onContribute,
}: {
  goal: SavingsGoal | null;
  onClose(): void;
  onContribute(): void;
}): JSX.Element {
  const today = useBudget((s) => s.today);
  const archiveGoal = useBudget((s) => s.archiveGoal);
  if (!goal) return <Sheet open={false} title="" onClose={onClose} children={null} />;

  const progress = goalProgress(goal, today);
  const byMonth = new Map<string, number>();
  for (const contribution of goal.contributions) {
    byMonth.set(contribution.month, (byMonth.get(contribution.month) ?? 0) + contribution.amount);
  }
  const months = [...byMonth.keys()].sort();
  const series = months.length > 0 ? months : [monthKeyOf(today), addMonths(monthKeyOf(today), 0)].slice(0, 1);

  return (
    <Sheet open title={goal.title} onClose={onClose}>
      <div className="detail-num">{formatRub(progress.saved)}</div>
      <div className="detail-lab">из {formatRub(goal.targetAmount)}</div>

      <div className="detail-art" style={{ marginTop: 12 }}>
        <BarsChart
          values={series.map((m) => byMonth.get(m) ?? 0)}
          labels={series.map(monthShort)}
          height={DETAIL_H}
          showLabels
        />
      </div>

      <div className="sub-i" style={{ marginTop: 10 }}>
        <span className="sub-n">Фактический темп</span>
        <span className="sub-v">{progress.avgPerMonth === null ? '—' : `${formatRub(progress.avgPerMonth)} в месяц`}</span>
      </div>
      <div className="sub-i">
        <span className="sub-n">Требуемый темп</span>
        <span className="sub-v">
          {progress.requiredPerMonth === null ? '—' : `${formatRub(progress.requiredPerMonth)} в месяц`}
        </span>
      </div>
      {progress.onSchedule !== null && (
        <p className="hint">{progress.onSchedule ? 'Идёте по графику.' : 'Текущий темп до срока не дотягивает.'}</p>
      )}

      <button className="save" onClick={onContribute}>
        Внести
      </button>
      <button className="sub-more" onClick={() => { archiveGoal(goal.id); onClose(); }}>
        Убрать из активных — взносы останутся в истории
      </button>
    </Sheet>
  );
}
