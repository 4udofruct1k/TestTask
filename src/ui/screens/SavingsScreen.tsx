/**
 * Накопления. Раздел 3.7.
 *
 * Место, где видно скопившиеся деньги. Модель и раньше переносила остаток
 * месяца в накопления — `net` каждого месяца и есть то, что от него
 * осталось, — но кучу было негде посмотреть: стартовая сумма участвовала
 * только в запасе прочности, а копилки жили отдельным экраном.
 *
 * Здесь же правятся цель по накоплению и стартовая сумма: обе про эту кучу,
 * и искать их в настройках незачем.
 *
 * Просроченная копилка не удаляется и не прячется: показывается
 * с непройденной датой и предложением сдвинуть срок.
 *
 * «Цель по накоплению» в месяц и копилка — разные вещи, и называться
 * одинаково они больше не должны: раньше обе были «целью».
 */

import { useState, type JSX } from 'react';
import { addMonths, monthKeyOf } from '../../domain/dates';
import { formatAmount, formatRub, parseAmount } from '../../domain/money';
import type { SavingsGoal } from '../../domain/types';
import {
  contributionsOfMonth,
  goalProgress,
  isOverdue,
  monthSummary,
  savingsLedger,
  targetAt,
} from '../../engine';
import { useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { TopBar } from '../components/TopBar';
import { Sheet } from '../components/Sheet';
import { AmountSheet } from '../components/AmountSheet';
import { AmountChoiceSheet } from '../components/AmountChoiceSheet';
import { ExpandableRow } from '../components/ExpandableRow';
import { BarsChart, DETAIL_H } from '../charts';
import { months as monthsWord, monthGenitive, monthShort, monthTitle, monthTitleLower } from '../format';
import { ContributionForm } from './ContributionForm';

type Dialog = 'target' | 'balance' | null;

export function SavingsScreen(): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const addGoal = useBudget((s) => s.addGoal);
  const setMonthlyTarget = useBudget((s) => s.setMonthlyTarget);
  const correctMonthlyTarget = useBudget((s) => s.correctMonthlyTarget);
  const updateSettings = useBudget((s) => s.updateSettings);
  const { go } = useUi();

  const [creating, setCreating] = useState(false);
  const [contributing, setContributing] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const [title, setTitle] = useState('');
  const [raw, setRaw] = useState('');
  const [deadline, setDeadline] = useState('');

  const month = monthKeyOf(today);
  const ledger = savingsLedger(doc, today);
  const target = targetAt(doc, month);
  const activeTargetMonth =
    [...doc.settings.targets].reverse().find((t) => t.fromMonth <= month)?.fromMonth ?? month;

  const active = doc.goals.filter((goal) => !goal.archived);
  const contributed = contributionsOfMonth(doc.goals, month);
  const net = monthSummary(doc, month, today).net;

  const amount = parseAmount(raw);
  const goalToOpen = active.find((g) => g.id === opened) ?? null;

  return (
    <section className="pane">
      <TopBar title="Накопления" onBack={() => go('home')} />
      <div className="scroll">
        <div className="body">
          {/* Сколько скопилось всего */}
          <div className="card">
            <div className="card-h">
              <div className="card-t">Накоплено</div>
            </div>
            <div className="detail-num">{formatRub(ledger.total)}</div>
            <div className="detail-lab">
              {ledger.earmarked > 0
                ? `в копилках ${formatRub(ledger.earmarked)} · свободно ${formatRub(ledger.free)}`
                : 'копилок пока нет'}
            </div>

            {/* Строка сразу и объясняет, и правится: вторым пунктом ниже она была бы дублем */}
            <button className="sub-i sub-i-btn" style={{ marginTop: 12 }} onClick={() => setDialog('balance')}>
              <span className="sub-n">
                Было к началу
                <span className="sub-d">изменить</span>
              </span>
              <span className="sub-v">{formatRub(ledger.startingBalance)}</span>
            </button>
            <div className="sub-i">
              <span className="sub-n">
                За прошлые месяцы
                <span className="sub-d">{monthsWord(ledger.months.filter((m) => !m.current).length)}</span>
              </span>
              <span className={`sub-v${ledger.closed < 0 ? ' negative' : ''}`}>
                {formatRub(ledger.closed)}
              </span>
            </div>
            <div className="sub-i">
              <span className="sub-n">
                В этом месяце
                <span className="sub-d">ещё идёт</span>
              </span>
              <span className={`sub-v${ledger.current < 0 ? ' negative' : ''}`}>
                {formatRub(ledger.current)}
              </span>
            </div>

            <p className="hint">По данным учёта, а не по счетам в банке.</p>
          </div>

          {/* Настройки самой кучи */}
          <div className="rows">
            <button className="setrow" onClick={() => setDialog('target')}>
              <span className="row-txt">
                <span className="row-t">Цель по накоплению</span>
                <span className="row-s">
                  {target === null ? 'не задана' : `${formatRub(target)} в месяц`}
                </span>
              </span>
              <span className="row-v">{target === null ? '' : formatAmount(target)}</span>
            </button>
          </div>

          {/* Помесячно: что каждый месяц добавил в кучу */}
          {ledger.months.length > 0 && (
            <div className="rows">
              <ExpandableRow
                title="По месяцам"
                subtitle={`${monthsWord(ledger.months.length)} учёта`}
                value={formatAmount(ledger.total - ledger.startingBalance)}
              >
                {ledger.months.map((entry) => (
                  <div className="sub-i" key={entry.month}>
                    <span className="sub-n">
                      {monthTitle(entry.month)}
                      {entry.current && <span className="sub-d">идёт</span>}
                    </span>
                    <span className={`sub-v${entry.net < 0 ? ' negative' : ''}`}>
                      {entry.net > 0 ? '+' : ''}
                      {formatAmount(entry.net)}
                    </span>
                  </div>
                ))}
              </ExpandableRow>
            </div>
          )}

          {/* Цели-копилки */}
          <div className="card-h" style={{ marginTop: 6 }}>
            <div className="card-t">Копилки</div>
            {ledger.earmarked > 0 && <div className="card-v">{formatRub(ledger.earmarked)}</div>}
          </div>

          {active.length === 0 && (
            <div className="empty" style={{ padding: '14px 4px' }}>
              <b>Копилок пока нет</b>
              Копилка — сумма на конкретное: новый компьютер, поездка. Деньги остаются
              в накоплениях.
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
              В копилки за {monthTitleLower(month)} ушло {formatRub(contributed)} — больше, чем
              осталось от месяца. Это нормально: деньги взяты из накопленного раньше.
            </p>
          )}

          <button className="link" onClick={() => setCreating(true)}>
            Новая копилка <span>накопить на конкретное</span>
          </button>
        </div>
      </div>

      <Sheet open={creating} title="Новая копилка" onClose={() => setCreating(false)}>
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

      {/* Цель по накоплению правится тем же диалогом, что и постоянная позиция (3.4) */}
      {target !== null ? (
        <AmountChoiceSheet
          open={dialog === 'target'}
          title="Цель по накоплению"
          current={target}
          effectiveMonth={month}
          currentPeriodMonth={activeTargetMonth}
          onForward={(value) => setMonthlyTarget(month, value)}
          onCorrect={(value) => correctMonthlyTarget(activeTargetMonth, value)}
          onClose={() => setDialog(null)}
        />
      ) : (
        <AmountSheet
          open={dialog === 'target'}
          title="Цель по накоплению"
          label="Сколько откладывать каждый месяц"
          initial={0}
          onSave={(value) => setMonthlyTarget(month, value)}
          onClose={() => setDialog(null)}
        />
      )}

      <AmountSheet
        open={dialog === 'balance'}
        title="Было к началу учёта"
        label="Сколько уже было накоплено"
        hint="Эта сумма лежит в основании кучи. Приложение не знает про ваши счета — цифру задаёте вы."
        initial={ledger.startingBalance}
        allowZero
        onSave={(value) => updateSettings({ startingBalance: value })}
        onClose={() => setDialog(null)}
      />

      <GoalDetail
        goal={goalToOpen}
        onClose={() => setOpened(null)}
        onContribute={() => {
          setOpened(null);
          setContributing(goalToOpen?.id ?? null);
        }}
      />
      <ContributionForm
        open={contributing !== null}
        goalId={contributing ?? undefined}
        onClose={() => setContributing(null)}
      />
    </section>
  );
}

/** Экран копилки: график взносов по месяцам, фактический темп против требуемого. */
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
        Убрать копилку — взносы останутся в истории
      </button>
    </Sheet>
  );
}
