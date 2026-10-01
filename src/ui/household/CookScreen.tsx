/**
 * Готовка. HOUSEHOLD_SPEC, раздел 5.
 *
 * Рецепты дня с граммовками и запись, сколько продуктов ушло на самом
 * деле. Записанное списывается с остатков дома, и покупки следующих дней
 * считаются от того, что осталось.
 */

import { useState, type JSX } from 'react';
import { cookingFor } from '../../household/cooking';
import { weekdayOf, weekKeyOf, weekOf, type DateStr } from '../../household/days';
import { dayOf, needsOf, PLAN } from '../../household/plan';
import { useHousehold } from '../../store/household';
import { amount, DAY_NAMES, parseQty, relativeDay } from './format';
import { ChipView, DayStrip, dishStyle, HBar } from './parts';

export function CookScreen(): JSX.Element {
  const today = useHousehold((s) => s.today);
  const view = useHousehold((s) => s.view);
  const setCooked = useHousehold((s) => s.setCooked);
  const [date, setDate] = useState<DateStr>(today);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const cooking = cookingFor(PLAN, view, date);
  const day = dayOf(PLAN, weekKeyOf(date));
  const when = relativeDay(date, today);

  const startEditing = (): void => {
    const initial: Record<string, string> = {};
    for (const row of cooking.rows) initial[row.product] = String(cooking.recorded ? row.used : row.planned);
    setDraft(initial);
    setEditing(true);
  };

  const parsed = Object.fromEntries(cooking.rows.map((r) => [r.product, parseQty(draft[r.product] ?? '')]));
  const valid = Object.values(parsed).every((v) => v !== null);

  const save = (): void => {
    if (!valid) return;
    setCooked(date, parsed as Record<string, number>);
    setEditing(false);
  };

  const clear = (): void => {
    setCooked(date, Object.fromEntries(cooking.rows.map((r) => [r.product, 0])));
    setEditing(false);
  };

  return (
    <section className="pane h-pane">
      <HBar title="Готовка" sub={DAY_NAMES[weekdayOf(date)]} />
      <div className="scroll">
        <div className="h-body">
          <DayStrip
            week={weekOf(today)}
            selected={date}
            today={today}
            onSelect={(d) => {
              setDate(d);
              setEditing(false);
            }}
            dishOf={(d) => dayOf(PLAN, weekKeyOf(d)).dish}
            off={(d) => Object.keys(needsOf(PLAN, weekKeyOf(d))).length === 0}
          />

          {cooking.recipes.length === 0 && (
            <div className="h-card">
              <p className="h-note">В этот день не готовим: едим то, что приготовили накануне.</p>
            </div>
          )}

          {cooking.recipes.map((r) => (
            <article key={r.title} className="h-card h-recipe" style={dishStyle(r.dish)}>
              <div>
                <h2>{r.title}</h2>
                <div className="when">{r.when}</div>
              </div>
              <div className="h-chips">
                {r.ingredients.map((c, i) => (
                  <ChipView key={i} chip={c} />
                ))}
              </div>
              {r.steps.length > 0 && (
                <ol className="h-steps">
                  {r.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
              {r.split && (
                <div className="h-split">
                  <b>Как делить</b>
                  {r.split}
                </div>
              )}
              {r.notes.map((n, i) => (
                <p key={i} className="h-note">
                  {n}
                </p>
              ))}
            </article>
          ))}

          {cooking.rows.length > 0 && !editing && (
            <div className="h-card h-stack" style={dishStyle(day.dish)}>
              <div className="h-label">{cooking.recorded ? `Записано: ушло ${when}` : 'Сколько ушло продуктов'}</div>
              {cooking.recorded ? (
                <div className="h-chips">
                  {cooking.rows
                    .filter((r) => r.used > 0)
                    .map((r) => (
                      <ChipView
                        key={r.product}
                        chip={{
                          e: r.p.e,
                          name: r.p.short,
                          amt: amount(r.used, r.p.unit),
                          sub: r.used === r.planned ? 'как в рецепте' : `в рецепте ${amount(r.planned, r.p.unit)}`,
                        }}
                      />
                    ))}
                </div>
              ) : (
                <p className="h-note">
                  Приготовили — запишите, сколько продуктов ушло. По умолчанию стоят граммовки рецепта; положили больше
                  или меньше — поправьте. Записанное спишется с остатков дома.
                </p>
              )}
              <button className={`h-btn${cooking.recorded ? ' ghost' : ''}`} onClick={startEditing}>
                {cooking.recorded ? 'Исправить' : 'Приготовили — записать'}
              </button>
              {cooking.recorded && (
                <button className="h-btn quiet" onClick={clear}>
                  Не готовили — вернуть продукты в остатки
                </button>
              )}
            </div>
          )}

          {editing && (
            <div className="h-card h-stack">
              <div className="h-label">Сколько ушло {when}</div>
              <div className="h-uses">
                {cooking.rows.map((r) => {
                  const value = parsed[r.product];
                  return (
                    <label key={r.product} className="h-use">
                      <span className="h-e" aria-hidden="true">
                        {r.p.e}
                      </span>
                      <span className="tx">
                        <b>{r.p.short}</b>
                        <small>
                          в рецепте {amount(r.planned, r.p.unit)} · дома {amount(r.stock + r.used, r.p.unit)}
                        </small>
                      </span>
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        value={draft[r.product] ?? ''}
                        aria-invalid={value === null}
                        aria-label={`${r.p.short}, сколько ушло`}
                        onChange={(e) => setDraft({ ...draft, [r.product]: e.target.value })}
                      />
                      <span className="unit">{r.p.unit}</span>
                    </label>
                  );
                })}
              </div>
              <p className="h-note">Ноль — продукт не использовали. Остатки дома пересчитаются по записанному.</p>
              <div className="h-editline">
                <button className="h-save" disabled={!valid} onClick={save}>
                  Записать
                </button>
                <button className="h-cancel" onClick={() => setEditing(false)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
