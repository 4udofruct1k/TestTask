/**
 * Главная. Раздел 3.2.
 *
 * Прогноз и факт визуально разделены и в одно число не смешиваются (3.10).
 */

import { useState, type JSX } from 'react';
import { addMonths, compareMonth, daysInMonth, dayOfMonth, monthKeyOf } from '../../domain/dates';
import { formatAmount, formatRub } from '../../domain/money';
import {
  fixedBlock,
  hasEnoughHistory,
  monthForecast,
  monthSummary,
  potentialExtra,
  resolveFixed,
  routineExpenses,
  oneOffExpenses,
  targetStatus,
  usualDaily,
  activeSpreadPeriod,
} from '../../engine';
import { useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { dayTitle, days as daysWord, monthTitle, purchases, positions, spendings } from '../format';
import { TopBar } from '../components/TopBar';
import { ExpandableRow } from '../components/ExpandableRow';
import { IncomeSheet } from './IncomeSheet';
import type { BudgetDocument } from '../../domain/types';

export function HomeScreen(): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const { month: selected, setMonth, go, setTab, setFilter } = useUi();
  const currentMonth = monthKeyOf(today);
  const month = selected ?? currentMonth;

  const summary = monthSummary(doc, month, today);
  const block = fixedBlock(doc, month);
  const forecast = monthForecast(doc, month, today);
  const status = targetStatus(doc, month, today);
  const fixed = resolveFixed(doc, month);

  const spent = summary.routineToDate + summary.oneOffToDate;
  // Правило красного: темп пробивает потолок до цели. Больше ничто на экране цвет не меняет
  const hot = Boolean(status && forecast?.visible && forecast.forecast > status.budget);

  const canGoBack = compareMonth(addMonths(month, -1), doc.settings.firstMonth) >= 0;
  const canGoForward = compareMonth(month, currentMonth) < 0;
  const swipe = useSwipe(
    () => canGoForward && setMonth(addMonths(month, 1)),
    () => canGoBack && setMonth(addMonths(month, -1)),
  );

  const [incomeOpen, setIncomeOpen] = useState(false);

  return (
    <section className="pane">
      <TopBar title={monthTitle(month)} sub={month === currentMonth ? dayTitle(today) : undefined} />
      <div className="scroll" {...swipe}>
        <div className="body">
          {/* 1. Бюджет месяца. Тап открывает доход: сумму правят здесь же */}
          <button className="hero" onClick={() => setIncomeOpen(true)} aria-label="Изменить доход месяца">
            <div className="hero-label">Бюджет месяца</div>
            <div className="hero-num">{formatRub(summary.totalIncome)}</div>
            <div className="hero-foot">
              <span>Свободные {formatAmount(summary.free)}</span>
              {status ? <span>Цель {formatAmount(status.target)}</span> : <span>Цель не задана</span>}
              {/* Удержание показывается, только когда оно включено */}
              {block.taxWithheld > 0 && <span>Удержано {formatAmount(block.taxWithheld)}</span>}
            </div>
          </button>

          {/* 2. Три микро-окна */}
          <div className="micro">
            <div className="mbox">
              <div className="mbox-l">Остаток</div>
              <div className={`mbox-n${summary.free - spent < 0 ? ' hot' : ''}`}>
                {formatAmount(summary.free - spent)}
              </div>
              <div className="mbox-u">из {formatAmount(summary.free)}</div>
            </div>
            <div className="mbox">
              <div className="mbox-l">Трачу в день</div>
              <div className={`mbox-n${hot ? ' hot' : ''}`}>
                {forecast ? formatAmount(Math.round(forecast.routinePace)) : '—'}
              </div>
              <div className="mbox-u">{usualHint(doc, today)}</div>
            </div>
            <div className="mbox">
              <div className="mbox-l">Разовые</div>
              <div className="mbox-n">{formatAmount(summary.oneOffExpense)}</div>
              <div className="mbox-u">за месяц</div>
            </div>
          </div>

          {/* 3. До цели */}
          {status ? (
            <div className="card">
              <div className="card-h">
                <div className="card-t">До цели</div>
                <div className={`card-v${status.remaining < 0 ? ' negative' : ''}`}>
                  {formatRub(status.remaining)}
                </div>
              </div>
              <div className="track">
                <i
                  className={hot ? 'hot' : ''}
                  style={{ width: `${clamp((status.committed / Math.max(1, status.budget)) * 100)}%` }}
                />
                {month === currentMonth && (
                  <u style={{ left: `${clamp((dayOfMonth(today) / daysInMonth(month)) * 100)}%` }} />
                )}
              </div>
              <Hint doc={doc} month={month} today={today} />
            </div>
          ) : (
            <div className="card">
              <div className="card-h">
                <div className="card-t">Цель по накоплению</div>
              </div>
              <p className="card-p">
                Задайте, сколько хочется откладывать каждый месяц, — появится потолок трат и дневной остаток.{' '}
                <button className="sub-more" onClick={() => go('settings')}>
                  Задать цель
                </button>
              </p>
            </div>
          )}

          {/* 4. Разбивка. Пустое состояние показывает, что сделать, а не нули (3.10) */}
          {summary.totalIncome === 0 && summary.monthCost === 0 ? (
            <div className="card">
              <div className="empty" style={{ padding: '18px 4px' }}>
                <b>В этом месяце пока ничего нет</b>
                Заведите зарплату и постоянные платежи — они считаются раз и живут по месяцам.
                Разовые и рутинные траты вносятся кнопкой снизу.
              </div>
            </div>
          ) : (
          <div className="rows">
            <ExpandableRow
              title="Постоянные"
              subtitle={`${positions(fixed.length)}${summary.reserved > 0 ? `, резерв ${formatAmount(summary.reserved)}` : ''}`}
              value={formatAmount(summary.fixedExpense)}
            >
              {fixed
                .filter((item) => item.kind === 'EXPENSE')
                .map((item) => (
                  <div className="sub-i" key={item.itemId}>
                    <span className="sub-n">
                      {item.title}
                      {item.isReserve && <span className="sub-d">{yearlyNote(doc, item.itemId, month)}</span>}
                      {item.overridden && <span className="sub-d">в этом месяце иначе</span>}
                    </span>
                    <span className="sub-v">{formatAmount(item.amount)}</span>
                  </div>
                ))}
              {fixed.filter((item) => item.kind === 'EXPENSE').length === 0 && (
                <div className="sub-i">
                  <span className="sub-n">Постоянных платежей пока нет</span>
                </div>
              )}
            </ExpandableRow>

            <ExpandableRow
              title="Рутина"
              subtitle={`${spendings(summary.routineToDate > 0 ? routineExpenses(doc, month).length : 0)} за ${daysWord(month === currentMonth ? dayOfMonth(today) : daysInMonth(month))}`}
              value={formatAmount(summary.routineExpense)}
            >
              {routineExpenses(doc, month)
                .slice(-6)
                .reverse()
                .map((expense) => (
                  <div className="sub-i" key={expense.id}>
                    <span className="sub-n">
                      {categoryName(doc, expense.categoryId)}
                      <span className="sub-d">{dayTitle(expense.date)}</span>
                    </span>
                    <span className="sub-v">{formatAmount(expense.amount)}</span>
                  </div>
                ))}
              {routineExpenses(doc, month).length > 6 && (
                <button
                  className="sub-more"
                  onClick={() => {
                    setFilter('routine');
                    setTab('history');
                    go('expenses');
                  }}
                >
                  Ещё {routineExpenses(doc, month).length - 6} — открыть историю
                </button>
              )}
              {routineExpenses(doc, month).length === 0 && (
                <div className="sub-i">
                  <span className="sub-n">Рутинных трат в этом месяце нет</span>
                </div>
              )}
            </ExpandableRow>

            <ExpandableRow
              title="Разовые"
              subtitle={purchases(oneOffExpenses(doc, month).length)}
              value={formatAmount(summary.oneOffExpense)}
            >
              {oneOffExpenses(doc, month).map((expense) => (
                <div className="sub-i" key={expense.id}>
                  <span className="sub-n">
                    {categoryName(doc, expense.categoryId)}
                    <span className="sub-d">{dayTitle(expense.date)}</span>
                  </span>
                  <span className="sub-v">{formatAmount(expense.amount)}</span>
                </div>
              ))}
              {oneOffExpenses(doc, month).length === 0 && (
                <div className="sub-i">
                  <span className="sub-n">Разовых покупок в этом месяце нет</span>
                </div>
              )}
            </ExpandableRow>

            <div className="total">
              <span className="row-txt">
                <span className="row-t">Потрачено всего</span>
                <span className="row-s">с постоянными</span>
              </span>
              <span className="row-v">{formatAmount(summary.monthCost)}</span>
            </div>
          </div>
          )}
        </div>
      </div>

      <IncomeSheet open={incomeOpen} month={month} onClose={() => setIncomeOpen(false)} />

      {/* 5. Кнопка добавления */}
      <div className="cta-slot">
        <button
          className="cta"
          aria-label="Добавить"
          onClick={() => {
            setTab('add');
            go('expenses');
          }}
        >
          +
        </button>
      </div>
    </section>
  );
}

/** Одна из трёх подсказок под полосой (3.2). */
function Hint({ doc, month, today }: { doc: BudgetDocument; month: string; today: string }): JSX.Element {
  const status = targetStatus(doc, month, today)!;
  const forecast = monthForecast(doc, month, today);
  const usual = usualDaily(doc, today);

  if (!forecast?.visible) {
    // Ниже порога достоверности прогноз не показывается: второго числа
    // одна покупка умножается на 30 и пугает без основания (2.8)
    return (
      <p className="card-p">
        Потолок трат на месяц — <b>{formatRub(status.budget)}</b>. Прогноз появится с{' '}
        {doc.settings.forecastMinDay}-го числа: раньше он держится на одной-двух тратах.
      </p>
    );
  }

  const over = forecast.forecast > status.budget;
  if (over) {
    return (
      <p className="card-p">
        По такому темпу месяц закроется на <b>{formatRub(forecast.forecast)}</b> при потолке{' '}
        {formatRub(status.budget)}. Мимо цели на <span className="hot">{formatRub(forecast.forecast - status.budget)}</span>.
        Чтобы вернуться — <b>{formatRub(status.dailyAllowance ?? 0)} в день</b> оставшиеся{' '}
        {daysWord(status.daysLeft)}.
      </p>
    );
  }

  // Условия показа potentialExtra — все сразу (2.8)
  if (usual !== null && forecast.routinePace > usual && hasEnoughHistory(doc, today)) {
    const extra = potentialExtra(forecast.routinePace, usual, status.daysLeft);
    return (
      <p className="card-p">
        Цель закрываешь. Но обычно у тебя выходит <b>{formatRub(Math.round(usual))} в день</b>, а сейчас{' '}
        {formatRub(Math.round(forecast.routinePace))}. Вернёшься к обычному темпу — отложишь на{' '}
        <b>{formatRub(extra)}</b> больше.
      </p>
    );
  }

  return (
    <p className="card-p">
      Идёшь с запасом. Можно держать до <b>{formatRub(status.dailyAllowance ?? 0)} в день</b> и всё равно
      закрыть цель.
    </p>
  );
}

function usualHint(doc: BudgetDocument, today: string): string {
  const usual = usualDaily(doc, today);
  return usual === null ? 'обычный темп пока не с чем сравнить' : `обычно ${formatAmount(Math.round(usual))}`;
}

function yearlyNote(doc: BudgetDocument, itemId: string, month: string): string {
  const item = doc.fixedItems.find((f) => f.id === itemId);
  if (!item || item.mode !== 'SPREAD') return '';
  const period = activeSpreadPeriod(item, month);
  return period ? `${formatRub(period.totalAmount)} за ${period.months} мес.` : '';
}

function categoryName(doc: BudgetDocument, categoryId: string): string {
  return doc.categories.find((c) => c.id === categoryId)?.name ?? 'Прочее';
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Месяц листается свайпом (3.2). */
function useSwipe(onLeft: () => void, onRight: () => void) {
  const [start, setStart] = useState<number | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => setStart(e.touches[0]?.clientX ?? null),
    onTouchEnd: (e: React.TouchEvent) => {
      if (start === null) return;
      const delta = (e.changedTouches[0]?.clientX ?? start) - start;
      setStart(null);
      if (delta < -60) onLeft();
      if (delta > 60) onRight();
    },
  };
}
