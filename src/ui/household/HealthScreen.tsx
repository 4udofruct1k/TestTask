/**
 * Здоровье. HOUSEHOLD_SPEC, раздел 10.
 *
 * Вес и замеры вписываются руками. Расход дня считается по весу и
 * проценту жира, рабочему дню сидя и тренировке — если она отмечена.
 * Съеденное — из рациона. По дням видно, сколько уходит в минус или
 * в плюс, а сверка с весами показывает, насколько расчёт точен.
 */

import { useState, type JSX } from 'react';
import { addDays, WEEK_KEYS, weekdayOf, weekOf, type DateStr } from '../../household/days';
import { PLAN } from '../../household/plan';
import { MEASURE_FIELDS, type Measurement, type MeasureField, type MeasureSpec } from '../../personal/doc';
import {
  bodyOn,
  calibrate,
  dayRow,
  dayRows,
  fatMass,
  KCAL_PER_KG,
  leanMass,
  totalBalance,
  type DayRow,
} from '../../personal/energy';
import { useHousehold } from '../../store/household';
import { usePersonal } from '../../store/personal';
import { useUi } from '../../store/ui';
import { dec, num, parseQty, shortDate, signedDec, signedKcal } from './format';
import { HBar } from './parts';
import { WeightChart } from './WeightChart';

const TRAINING_MARK: Record<DayRow['training'], string> = {
  done: '✓',
  missed: '—',
  pending: '·',
  planned: 'план',
  rest: '',
};

function balanceWord(balance: number): string {
  if (balance < 0) return 'дефицит';
  if (balance > 0) return 'профицит';
  return 'ровно';
}

interface FormProps {
  initial: Measurement;
  today: DateStr;
  onSave(m: Measurement): void;
  onCancel(): void;
}

function MeasureForm({ initial, today, onSave, onCancel }: FormProps): JSX.Element {
  const [date, setDate] = useState(initial.date);
  const [text, setText] = useState<Record<MeasureField, string>>(
    () =>
      Object.fromEntries(
        MEASURE_FIELDS.map((f) => [f.key, initial[f.key] !== undefined ? dec(initial[f.key]!, 1) : '']),
      ) as Record<MeasureField, string>,
  );

  const parsed = MEASURE_FIELDS.map((f) => {
    const raw = text[f.key].trim();
    if (raw === '') return { f, value: undefined, ok: true };
    const value = parseQty(raw);
    return { f, value: value ?? undefined, ok: value !== null && value >= f.min && value <= f.max };
  });
  const valid = parsed.every((p) => p.ok) && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const empty = parsed.every((p) => p.value === undefined);
  // Бицепс и бедро — по желанию: раскрыты, только если уже вписаны
  const [extraOpen, setExtraOpen] = useState(() =>
    MEASURE_FIELDS.some((f) => f.group === 'extra' && initial[f.key] !== undefined),
  );

  const input = ({ f, ok }: { f: MeasureSpec; ok: boolean }): JSX.Element => (
    <span className="m-input">
      <input
        inputMode="decimal"
        autoComplete="off"
        value={text[f.key]}
        aria-invalid={!ok}
        aria-label={f.label}
        placeholder="—"
        onChange={(e) => setText({ ...text, [f.key]: e.target.value })}
      />
      <i>{f.unit}</i>
    </span>
  );

  const girthRows = (group: 'main' | 'extra'): JSX.Element[] =>
    parsed
      .filter((p) => p.f.group === group)
      .map((p) => (
        <label key={p.f.key} className="m-row">
          <span className="m-name">
            <b>{p.f.label}</b>
            {p.f.hint && <small>{p.f.hint}</small>}
          </span>
          {input(p)}
        </label>
      ));

  const save = (): void => {
    if (!valid || empty) return;
    const m: Measurement = { date };
    for (const p of parsed) if (p.value !== undefined) m[p.f.key] = p.value;
    onSave(m);
  };

  return (
    <div className="h-card h-stack">
      <div className="h-label">Замер</div>
      <label className="m-date">
        <span>Дата</span>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="m-grid">
        {parsed
          .filter((p) => p.f.group === 'body')
          .map((p) => (
            <label key={p.f.key} className="m-field">
              <span>{p.f.label}</span>
              {input(p)}
            </label>
          ))}
      </div>
      <div className="m-girths">
        <div className="m-sub">Обхваты</div>
        {girthRows('main')}
        {extraOpen ? (
          girthRows('extra')
        ) : (
          <button className="t-link m-more" onClick={() => setExtraOpen(true)}>
            Ещё замеры: бицепс, бедро
          </button>
        )}
      </div>
      <p className="h-note">
        Любое поле можно оставить пустым. Вес и жир — для расчёта расхода; жир можно вписывать реже, берётся
        последний. Мерьте утром, натощак, раз в неделю в один и тот же день; лента лежит ровно, не пережимает.
      </p>
      <div className="h-editline">
        <button className="h-save" disabled={!valid || empty} onClick={save}>
          Сохранить
        </button>
        <button className="h-cancel" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

export function HealthScreen(): JSX.Element {
  const today = useHousehold((s) => s.today);
  const me = useHousehold((s) => s.local.me);
  const doc = usePersonal((s) => s.doc);
  const saveMeasurement = usePersonal((s) => s.saveMeasurement);
  const removeMeasurement = usePersonal((s) => s.removeMeasurement);
  const go = useUi((s) => s.go);

  const [form, setForm] = useState<Measurement | null>(null);
  const [weekStart, setWeekStart] = useState<DateStr>(weekOf(today)[0]!);
  const [confirmRemove, setConfirmRemove] = useState<DateStr | null>(null);

  if (!me) {
    return (
      <section className="pane h-pane">
        <HBar title="Здоровье" />
        <div className="scroll">
          <div className="h-body">
            <div className="h-card h-stack">
              <p className="h-note">Сначала выберите на главной, чей это телефон: замеры и расход у каждого свои.</p>
              <button className="h-btn" onClick={() => go('hub')}>
                На главную
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const data = doc.people[me];
  const ms = data.measurements;
  const body = bodyOn(ms, today);
  const todayRow = dayRow(PLAN, me, data, today, today);
  const e = todayRow.energy;

  const week = weekOf(weekStart);
  const rows = dayRows(PLAN, me, data, week, today);
  const factRows = rows.filter((r) => r.date <= today);
  const fact = totalBalance(factRows);
  const planned = totalBalance(rows);
  const isCurrentWeek = week.includes(today);
  const firstWeek = ms[0] ? weekOf(ms[0].date)[0]! : weekOf(today)[0]!;
  const calibration = calibrate(PLAN, me, data, today);

  const weights = ms.filter((m) => m.weight !== undefined).map((m) => ({ date: m.date, value: m.weight! }));
  const latest = ms[ms.length - 1];
  const previous = ms.length > 1 ? ms[ms.length - 2] : undefined;

  const delta = (field: MeasureField): number | null => {
    if (!latest || latest[field] === undefined) return null;
    const before = [...ms.slice(0, -1)].reverse().find((m) => m[field] !== undefined);
    return before ? latest[field]! - before[field]! : null;
  };

  return (
    <section className="pane h-pane">
      <HBar title="Здоровье" />
      <div className="scroll">
        <div className="h-body">
          {e ? (
            <div className={`g-hero ${e.balance <= 0 ? 'minus' : 'plus'}`}>
              <small>Сегодня, по расчёту</small>
              <b>{signedKcal(e.balance)}</b>
              <span className="g-word">
                ккал · {balanceWord(e.balance)}
                {e.balance !== 0 && ` ≈ ${dec(Math.abs(e.balance) / KCAL_PER_KG, 2)} кг`}
              </span>
              <div className="g-sum">
                <span>
                  Съедено <b>{num(e.intake)}</b>
                </span>
                <span>
                  Расход <b>{num(e.total)}</b>
                </span>
              </div>
            </div>
          ) : (
            <div className="h-card h-stack">
              <b className="t-empty">Впишите вес и процент жира</b>
              <p className="h-note">
                По ним считается расход за день: основной обмен — по сухой массе, плюс рабочий день, переваривание еды и
                тренировки.
              </p>
            </div>
          )}

          {e && body && (
            <div className="h-card">
              <div className="h-label">Из чего расход сегодня</div>
              <div className="g-parts">
                <div>
                  <span>
                    Основной обмен
                    <small>
                      сухая масса {dec(leanMass(body.weight, body.fat))} кг ({dec(body.weight)} кг, жир {dec(body.fat)}%)
                    </small>
                  </span>
                  <b>{num(e.basal)}</b>
                </div>
                <div>
                  <span>
                    Рабочий день сидя и быт
                    <small>работа 11–20 головой почти не добавляет — учтена как сидячий день</small>
                  </span>
                  <b>+{num(e.desk)}</b>
                </div>
                <div>
                  <span>
                    Переваривание еды
                    <small>десятая часть съеденного</small>
                  </span>
                  <b>+{num(e.digestion)}</b>
                </div>
                <div className={todayRow.training === 'done' ? '' : 'muted'}>
                  <span>
                    Тренировка
                    <small>
                      {todayRow.training === 'done'
                        ? 'отмечена выполненной'
                        : todayRow.training === 'rest'
                          ? 'сегодня не по плану'
                          : `не отмечена — ${num(todayRow.plannedTraining)} ккал войдут после отметки`}
                    </small>
                  </span>
                  <b>+{num(e.training)}</b>
                </div>
                <div className="sum">
                  <span>Расход за день</span>
                  <b>{num(e.total)}</b>
                </div>
                <div>
                  <span>
                    Съедено
                    <small>по рациону дня</small>
                  </span>
                  <b>{num(e.intake)}</b>
                </div>
              </div>
              {todayRow.training === 'pending' && (
                <button className="h-btn ghost top" onClick={() => go('training')}>
                  Отметить тренировку
                </button>
              )}
            </div>
          )}

          {form ? (
            <MeasureForm
              initial={form}
              today={today}
              onSave={(m) => {
                // Дату поменяли при правке — старая запись уходит
                if (form.date !== m.date && ms.some((x) => x.date === form.date)) removeMeasurement(me, form.date);
                saveMeasurement(me, m);
                setForm(null);
              }}
              onCancel={() => setForm(null)}
            />
          ) : (
            <div className="h-card h-stack">
              <div className="h-label">Вес и замеры</div>
              {latest ? (
                <>
                  <div className="g-stats">
                    {MEASURE_FIELDS.filter((f) => latest[f.key] !== undefined).map((f) => {
                      const d = delta(f.key);
                      return (
                        <div key={f.key}>
                          <small>{f.label}</small>
                          <b>
                            {dec(latest[f.key]!)}
                            <i> {f.unit}</i>
                          </b>
                          {d !== null && <span>{signedDec(d)}</span>}
                        </div>
                      );
                    })}
                    {body && latest.weight !== undefined && (
                      <div>
                        <small>Жировая масса</small>
                        <b>
                          {dec(fatMass(body.weight, body.fat))}
                          <i> кг</i>
                        </b>
                        <span>сухая {dec(leanMass(body.weight, body.fat))}</span>
                      </div>
                    )}
                  </div>
                  <p className="h-note">
                    Последний замер — {shortDate(latest.date)}
                    {previous && `, разница — с ${shortDate(previous.date)}`}.
                  </p>
                  <WeightChart points={weights} />
                </>
              ) : (
                <p className="h-note">Замеров пока нет.</p>
              )}
              <button className="h-btn" onClick={() => setForm({ date: today })}>
                Внести замер
              </button>
            </div>
          )}

          <div className="h-card h-stack">
            <div className="g-weekbar">
              <button
                className="h-back"
                aria-label="Неделя раньше"
                disabled={weekStart <= firstWeek}
                onClick={() => setWeekStart(addDays(weekStart, -7))}
              >
                ‹
              </button>
              <div>
                <div className="h-label">Анализ по дням</div>
                <b>
                  {shortDate(week[0]!)} — {shortDate(week[6]!)}
                </b>
              </div>
              <button
                className="h-back"
                aria-label="Неделя позже"
                disabled={isCurrentWeek}
                onClick={() => setWeekStart(addDays(weekStart, 7))}
              >
                ›
              </button>
            </div>
            {rows.every((r) => r.energy === null) ? (
              <p className="h-note">Расход появится, когда будут вписаны вес и процент жира.</p>
            ) : (
              <>
                <div className="g-days">
                  <div className="g-dh">
                    <span>День</span>
                    <span>Съедено</span>
                    <span>Расход</span>
                    <span>Итог</span>
                  </div>
                  {rows.map((r) => (
                    <div key={r.date} className={`g-day${r.date > today ? ' future' : ''}${r.date === today ? ' today' : ''}`}>
                      <span>
                        <b>{WEEK_KEYS[weekdayOf(r.date)]}</b>
                        <i className={`g-tr ${r.training}`}>{TRAINING_MARK[r.training]}</i>
                      </span>
                      <span>{r.energy ? num(r.energy.intake) : '—'}</span>
                      <span>{r.energy ? num(r.energy.total) : '—'}</span>
                      <span className={r.energy && r.energy.balance > 0 ? 'plus' : 'minus'}>
                        {r.energy ? signedKcal(r.energy.balance) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="g-total">
                  <span>{isCurrentWeek ? 'По факту на сегодня' : 'За неделю'}</span>
                  <b>
                    {signedKcal(fact)} ккал ≈ {signedDec(fact / KCAL_PER_KG, 2)} кг
                  </b>
                </div>
                {isCurrentWeek && planned !== fact && (
                  <div className="g-total muted">
                    <span>Если всё по плану до воскресенья</span>
                    <b>
                      {signedKcal(planned)} ккал ≈ {signedDec(planned / KCAL_PER_KG, 2)} кг
                    </b>
                  </div>
                )}
                <p className="h-note">
                  ✓ — тренировка отмечена и вошла в расход. Прочерк — день прошёл без отметки. Точка — сегодня ещё
                  не отмечена. «План» — будущий день, тренировка взята по плану. Съеденное — по рациону.
                </p>
              </>
            )}
          </div>

          <div className="h-card h-stack">
            <div className="h-label">Сверка с весами</div>
            {calibration ? (
              <>
                <p className="g-cal">
                  С {shortDate(calibration.from)} по {shortDate(calibration.to)} по расчёту{' '}
                  <b>{signedDec(calibration.predicted, 2)} кг</b>, по весам <b>{signedDec(calibration.actual, 2)} кг</b>.
                </p>
                <p className="h-note">
                  {Math.abs(calibration.gapPerDay) < 50
                    ? 'Расчёт сходится с весами — расходу можно верить.'
                    : `Похоже, реальный расход на ≈${num(Math.abs(calibration.gapPerDay))} ккал в день ${
                        calibration.gapPerDay > 0 ? 'больше' : 'меньше'
                      } расчётного.`}{' '}
                  Вес за день гуляет на 0,5–1 кг из-за воды и соли, поэтому вывод надёжнее через 2–3 недели. Если ели не
                  по рациону, разница тоже попадёт сюда.
                </p>
              </>
            ) : (
              <p className="h-note">
                Появится после двух взвешиваний с промежутком от недели: сколько должно было уйти по расчёту и сколько
                ушло на самом деле.
              </p>
            )}
          </div>

          {ms.length > 0 && (
            <details className="h-card h-more">
              <summary>Все замеры</summary>
              <div className="g-history">
                {[...ms].reverse().map((m) => (
                  <div key={m.date} className="g-entry">
                    <div>
                      <b>{shortDate(m.date)}</b>
                      <span>
                        {MEASURE_FIELDS.filter((f) => m[f.key] !== undefined)
                          .map((f) => `${f.label.toLowerCase()} ${dec(m[f.key]!)} ${f.unit}`)
                          .join(' · ')}
                      </span>
                    </div>
                    {confirmRemove === m.date ? (
                      <div className="h-editline">
                        <button
                          className="h-save danger"
                          onClick={() => {
                            removeMeasurement(me, m.date);
                            setConfirmRemove(null);
                          }}
                        >
                          Удалить
                        </button>
                        <button className="h-cancel" onClick={() => setConfirmRemove(null)}>
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="g-acts">
                        <button onClick={() => setForm(m)}>Изменить</button>
                        <button onClick={() => setConfirmRemove(m.date)}>Удалить</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          <details className="h-card h-more">
            <summary>Как считается</summary>
            <div className="h-note g-how">
              <p>
                <b>Основной обмен</b> — формула Кэтча — Макардла: 370 + 21,6 × сухая масса. Сухая масса — вес без жира,
                поэтому нужны вес и процент жира, а рост и возраст — нет.
              </p>
              <p>
                <b>Рабочий день</b> — четверть основного обмена: сидячая работа 11–20, дом, дорога. Умственная работа
                почти не добавляет: мозг тратит примерно одинаково и в покое, и над задачей.
              </p>
              <p>
                <b>Переваривание</b> — десятая часть съеденного. <b>Тренировка</b> — расход из «Тренировки», только
                когда она отмечена выполненной. Подходы в течение рабочего дня входят в неё.
              </p>
              <p>
                <b>Съедено</b> — сумма приёмов пищи по рациону дня. Килограмм жира ≈ 7 700 ккал. Точность расчёта —
                около ±10%; сверка с весами показывает, куда он ошибается.
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
