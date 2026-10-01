/**
 * Питание. HOUSEHOLD_SPEC, раздел 2.
 *
 * У каждого своя вкладка: порции разные, цели по калориям тоже. Приём
 * пищи — карточка, продукты в ней — фишками с граммовками, а не строкой.
 */

import { useState, type JSX } from 'react';
import { weekdayOf, weekKeyOf, weekOf, type DateStr } from '../../household/days';
import { dayOf, needsOf, PLAN } from '../../household/plan';
import { PEOPLE, type Person } from '../../household/types';
import { useHousehold } from '../../store/household';
import { DAY_NAMES, num } from './format';
import { ChipView, DayStrip, dishStyle, HBar } from './parts';

function Bar({ label, value, goal }: { label: string; value: number; goal: number }): JSX.Element {
  return (
    <div className="h-mbar">
      <small>{label}</small>
      <b>
        {num(value)} / {num(goal)}
      </b>
      <div className="h-track">
        <i style={{ width: `${Math.min(100, (value / goal) * 100)}%` }} />
      </div>
    </div>
  );
}

export function FoodScreen(): JSX.Element {
  const today = useHousehold((s) => s.today);
  const me = useHousehold((s) => s.local.me);
  const [person, setPerson] = useState<Person>(me ?? 'max');
  const [date, setDate] = useState<DateStr>(today);

  const day = dayOf(PLAN, weekKeyOf(date));
  const goal = PLAN.people[person];
  const meals = day.meals.filter((m) => (m.who[person]?.groups ?? []).length > 0);
  const sum = meals.reduce(
    (acc, m) => {
      const k = m.who[person]?.kbju;
      if (k) {
        acc.kcal += k.kcal;
        acc.p += k.p;
        acc.f += k.f;
        acc.c += k.c;
      }
      return acc;
    },
    { kcal: 0, p: 0, f: 0, c: 0 },
  );

  return (
    <section className="pane h-pane">
      <HBar title="Питание" sub={DAY_NAMES[weekdayOf(date)]} />
      <div className="scroll">
        <div className="h-body" style={dishStyle(day.dish)}>
          <div className="h-seg" role="group" aria-label="Чьё питание">
            {PEOPLE.map((p) => (
              <button key={p.id} aria-pressed={p.id === person} onClick={() => setPerson(p.id)}>
                {p.name}
              </button>
            ))}
          </div>

          <DayStrip
            week={weekOf(today)}
            selected={date}
            today={today}
            onSelect={setDate}
            dishOf={(d) => dayOf(PLAN, weekKeyOf(d)).dish}
            off={(d) => Object.keys(needsOf(PLAN, weekKeyOf(d))).length === 0}
          />

          <div className="h-card h-daysum">
            <div className="big">
              <b>{num(sum.kcal)}</b>
              <span>ккал из ≈{num(goal.kcal)}</span>
            </div>
            <div className="h-track">
              <i style={{ width: `${Math.min(100, (sum.kcal / goal.kcal) * 100)}%` }} />
            </div>
            <div className="h-bars">
              <Bar label="Белки" value={sum.p} goal={goal.p} />
              <Bar label="Жиры" value={sum.f} goal={goal.f} />
              <Bar label="Углеводы" value={sum.c} goal={goal.c} />
            </div>
            {day.cook && <p className="h-note">🍳 {day.cook}</p>}
          </div>

          {meals.map((m) => {
            const w = m.who[person]!;
            return (
              <article key={m.name} className="h-card h-meal">
                <div className="h-meal-h">
                  <strong>
                    {m.name}
                    {m.fresh && <span className="h-fresh">готовим сегодня</span>}
                  </strong>
                  {w.kbju && <span className="kc">{num(w.kbju.kcal)} ккал</span>}
                  {m.dish && <span className="dish">{m.dish}</span>}
                </div>
                {w.groups.map((g, i) => (
                  <div key={i} className="h-group">
                    {g.label && <div className="h-group-label">{g.label}</div>}
                    <div className="h-chips">
                      {g.chips.map((c, j) => (
                        <ChipView key={j} chip={c} />
                      ))}
                    </div>
                  </div>
                ))}
                {w.kbju && (
                  <div className="h-macros">
                    <span>
                      Б <b>{w.kbju.p}</b>
                    </span>
                    <span>
                      Ж <b>{w.kbju.f}</b>
                    </span>
                    <span>
                      У <b>{w.kbju.c}</b>
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
