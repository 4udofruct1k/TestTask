/**
 * Календарь годовых. Раздел 3.6.
 *
 * Экран существует ради одной проблемы: приложение честно показывает
 * 1 200 ₽ в месяц, а в марте с карты уходит 14 400. Без календаря
 * размазывание годовых из удобства превращается в ловушку.
 */

import type { JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatRub } from '../../domain/money';
import { annualCalendar, resolveFixed } from '../../engine';
import { useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { TopBar } from '../components/TopBar';
import { monthTitle } from '../format';

export function CalendarScreen(): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const { go } = useUi();

  const month = monthKeyOf(today);
  const calendar = annualCalendar(doc, month, 12);
  const yearTotal = calendar.reduce((sum, entry) => sum + entry.total, 0);
  const shareTotal = resolveFixed(doc, month)
    .filter((item) => item.isReserve)
    .reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="pane">
      <TopBar title="Календарь годовых" burger={false} onBack={() => go('expenses')} />
      <div className="scroll">
        <div className="elist">
          <div className="eday">
            Ближайшие 12 месяцев
            <b>{formatRub(yearTotal)}</b>
          </div>

          {calendar.map((entry) => (
            <div className={`calm${entry.payments.length > 0 ? ' hit' : ''}`} key={entry.month}>
              <span className="calm-txt">
                <span className="calm-m">{monthTitle(entry.month)}</span>
                <span className="calm-s">
                  {entry.payments.length > 0
                    ? `${entry.payments.map((p) => p.title).join(', ')} — списание целиком`
                    : 'ничего крупного'}
                </span>
              </span>
              <span className={`calm-v${entry.payments.length > 0 ? '' : ' z'}`}>
                {entry.payments.length > 0 ? formatRub(entry.total) : '—'}
              </span>
            </div>
          ))}

          <p className="card-p" style={{ padding: '6px 2px 0' }}>
            В бюджете эти платежи уже учтены долями по {formatRub(shareTotal)} в месяц. Календарь нужен,
            чтобы день списания не застал врасплох: приложение показывает долю, а с карты уйдёт вся сумма.
          </p>
        </div>
      </div>
    </section>
  );
}
