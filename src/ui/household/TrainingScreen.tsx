/**
 * Тренировка. HOUSEHOLD_SPEC, раздел 9.
 *
 * У каждого свой план. День — расписание по часам: подходы в начале
 * часа и каждые 15 минут, пояснения к технике под упражнением. Отметка
 * «выполнено» кладёт расход тренировки в «Здоровье». Расход по дням
 * правится: можно вписать свой вместо оценки плана.
 */

import { useState, type JSX } from 'react';
import { WEEK_KEYS, weekdayOf, weekKeyOf, weekOf, type DateStr, type WeekKey } from '../../household/days';
import { PEOPLE, personName, type Person } from '../../household/types';
import { plannedKcal, TRAINING, trainingDay, type Slot } from '../../personal/training';
import { useHousehold } from '../../store/household';
import { usePersonal } from '../../store/personal';
import { DAY_NAMES, num, relativeDay } from './format';
import { DayStrip, dishStyle, HBar, neighbour, QtyEditor } from './parts';
import { useSwipe } from '../swipe';

const genitive = (person: Person): string => (person === 'max' ? 'Макса' : 'Ильвины');
const capital = (text: string): string => text[0]!.toUpperCase() + text.slice(1);

function SlotRow({ slot }: { slot: Slot }): JSX.Element {
  if (slot.kind === 'break') {
    return (
      <div className="t-break">
        <span>{slot.time}</span>
        <b>🍽 {slot.title}</b>
      </div>
    );
  }
  return (
    <div className={`t-slot${slot.kind ? ` ${slot.kind}` : ''}`}>
      <span className="t-time">{slot.time}</span>
      <div className="t-what">
        <b>{slot.title}</b>
        {slot.marks && (
          <span className="t-marks" aria-label={`Подходы: ${slot.marks.join(', ')}`}>
            {slot.marks.map((m) => (
              <i key={m}>{m}</i>
            ))}
          </span>
        )}
        {slot.until && (
          <span className="t-marks">
            <i>до {slot.until}</i>
          </span>
        )}
        {slot.note && <small>{slot.note}</small>}
      </div>
    </div>
  );
}

export function TrainingScreen(): JSX.Element {
  const today = useHousehold((s) => s.today);
  const me = useHousehold((s) => s.local.me);
  const doc = usePersonal((s) => s.doc);
  const markDone = usePersonal((s) => s.markDone);
  const setOwnKcal = usePersonal((s) => s.setOwnKcal);

  const [person, setPerson] = useState<Person>(me ?? 'max');
  const [date, setDate] = useState<DateStr>(today);
  const [editingDone, setEditingDone] = useState(false);
  const [editingKey, setEditingKey] = useState<WeekKey | null>(null);

  const week = weekOf(today);
  const plan = TRAINING[person];
  const data = doc.people[person];
  const key = weekKeyOf(date);
  const day = trainingDay(person, key);
  const mine = person === me;
  const done = data.done[date];
  const planned = plannedKcal(person, key, data.kcal);

  const weekPlanned = plan.reduce((s, d) => s + plannedKcal(person, d.key, data.kcal), 0);
  const weekLow = plan.reduce((s, d) => s + d.kcal.low, 0);
  const weekHigh = plan.reduce((s, d) => s + d.kcal.high, 0);
  const weekDone = week.filter((d) => data.done[d] !== undefined);
  const weekDoneKcal = weekDone.reduce((s, d) => s + (data.done[d] ?? 0), 0);

  const select = (d: DateStr): void => {
    setDate(d);
    setEditingDone(false);
  };
  const swipe = useSwipe(
    () => select(neighbour(week, date, 1)),
    () => select(neighbour(week, date, -1)),
  );

  return (
    <section className="pane h-pane">
      <HBar title="Тренировка" sub={DAY_NAMES[weekdayOf(date)]} />
      <div className="scroll" {...swipe}>
        <div className="h-body">
          <div className="h-seg" role="group" aria-label="Чья тренировка">
            {PEOPLE.map((p) => (
              <button key={p.id} aria-pressed={p.id === person} onClick={() => setPerson(p.id)}>
                {p.name}
              </button>
            ))}
          </div>

          {plan.length === 0 || !day ? (
            <div className="h-card h-stack">
              <b className="t-empty">План {genitive(person)} появится позже</b>
              <p className="h-note">
                Когда план будет готов, он встанет сюда так же: по дням, по часам, с расходом и отметками.
              </p>
            </div>
          ) : (
            <>
              <DayStrip
                week={week}
                selected={date}
                today={today}
                onSelect={select}
                dishOf={(d) => trainingDay(person, weekKeyOf(d))?.focus ?? 'rest'}
                off={() => false}
              />

              <div className={`t-hero t-${day.focus}`}>
                <span className="t-pic" aria-hidden="true">
                  {day.emoji}
                </span>
                <small>
                  {capital(relativeDay(date, today))}
                  {done !== undefined && ' · выполнено ✓'}
                </small>
                <b>{day.title}</b>
                {day.subtitle && <span className="t-sub">{day.subtitle}</span>}
                <span className="t-kcal">
                  {done !== undefined ? (
                    <>
                      ушло <b>{num(done)}</b> ккал
                    </>
                  ) : (
                    <>
                      ≈<b>{num(planned)}</b> ккал{' '}
                      {data.kcal[key] !== undefined ? '· свой расход' : `· ${num(day.kcal.low)}–${num(day.kcal.high)}`}
                    </>
                  )}
                </span>
              </div>

              <div className="h-card h-stack">
                {!mine ? (
                  <p className="h-note">Отмечает {personName(person)} на своём телефоне.</p>
                ) : date > today ? (
                  <p className="h-note">Отметить можно в день тренировки или позже.</p>
                ) : editingDone ? (
                  <QtyEditor
                    id="done-kcal"
                    label="Сколько ккал ушло"
                    initial={done ?? planned}
                    unit="ккал"
                    step={10}
                    saveLabel="Выполнено"
                    hint="По умолчанию — расход дня из таблицы ниже. Сделали меньше или больше — поправьте."
                    onSave={(value) => {
                      markDone(person, date, value);
                      setEditingDone(false);
                    }}
                    onCancel={() => setEditingDone(false)}
                  />
                ) : done !== undefined ? (
                  <>
                    <p className="h-note">
                      Тренировка отмечена: {num(done)} ккал вошли в расход дня в «Здоровье».
                    </p>
                    <div className="h-editline">
                      <button className="h-save" onClick={() => setEditingDone(true)}>
                        Изменить
                      </button>
                      <button className="h-cancel" onClick={() => markDone(person, date, null)}>
                        Снять отметку
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button className="h-btn" onClick={() => setEditingDone(true)}>
                      Отметить выполненной
                    </button>
                    <p className="h-note">Пока не отмечена, расход тренировки в «Здоровье» не входит.</p>
                  </>
                )}
              </div>

              <div className="h-card t-plan" style={dishStyle(day.focus)}>
                <div className="h-label">Расписание</div>
                {day.slots.map((slot, i) => (
                  <SlotRow key={i} slot={slot} />
                ))}
              </div>

              <div className="h-card h-stack">
                <div className="h-label">Расход по тренировкам</div>
                <div className="t-table">
                  {plan.map((d) => {
                    const own = data.kcal[d.key];
                    const value = plannedKcal(person, d.key, data.kcal);
                    const dDate = week[WEEK_KEYS.indexOf(d.key)]!;
                    const ticked = data.done[dDate] !== undefined;
                    if (editingKey === d.key) {
                      return (
                        <div key={d.key} className="t-row editing">
                          <QtyEditor
                            id={`kcal-${d.key}`}
                            label={`Свой расход: ${d.key.toLowerCase()} — ${d.title.toLowerCase()}`}
                            initial={value}
                            unit="ккал"
                            step={10}
                            hint={
                              <>
                                Оценка плана — {num(d.kcal.mid)} ккал ({num(d.kcal.low)}–{num(d.kcal.high)}).{' '}
                                {own !== undefined && (
                                  <button
                                    className="t-link"
                                    onClick={() => {
                                      setOwnKcal(person, d.key, null);
                                      setEditingKey(null);
                                    }}
                                  >
                                    Вернуть оценку
                                  </button>
                                )}
                              </>
                            }
                            onSave={(v) => {
                              setOwnKcal(person, d.key, v);
                              setEditingKey(null);
                            }}
                            onCancel={() => setEditingKey(null)}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={d.key} className={`t-row${d.key === key ? ' current' : ''}`} style={dishStyle(d.focus)}>
                        <i className="t-dot" aria-hidden="true" />
                        <span className="t-day">
                          <b>{d.key}</b> {d.title.toLowerCase()}
                          {ticked && <span className="t-tick"> ✓</span>}
                        </span>
                        <span className="t-val">
                          <b>≈{num(value)}</b>
                          <small>{own !== undefined ? 'свой' : `${num(d.kcal.low)}–${num(d.kcal.high)}`}</small>
                        </span>
                        {mine && (
                          <button className="t-edit" aria-label={`Изменить расход: ${d.key}`} onClick={() => setEditingKey(d.key)}>
                            ✎
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <div className="t-row total">
                    <span className="t-day">
                      <b>Неделя</b>
                    </span>
                    <span className="t-val">
                      <b>≈{num(weekPlanned)}</b>
                      <small>
                        {num(weekLow)}–{num(weekHigh)}
                      </small>
                    </span>
                  </div>
                </div>
                <p className="h-note">
                  На этой неделе выполнено {weekDone.length} из {plan.length}
                  {weekDone.length > 0 && ` · ${num(weekDoneKcal)} ккал`}. В расход дня тренировка входит, только когда
                  отмечена.
                  {mine && ' Карандаш — вписать свой расход вместо оценки.'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
