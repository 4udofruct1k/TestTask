/**
 * Покупки по дням. HOUSEHOLD_SPEC, раздел 4.
 *
 * Список считается из готовки: что нужно на блюда дня и на мясо и рыбу
 * следующего, минус то, что дома. Полоса дней — сегодня и шесть следующих:
 * на будущий день «дома» — прогноз после готовки предыдущих дней.
 * «Купил» записывает, сколько куплено на самом деле.
 */

import { useState, type JSX } from 'react';
import { addDays, WEEK_KEYS, weekdayOf, weekKeyOf, type DateStr } from '../../household/days';
import { dayOf, needsOf, PLAN, recipesOf } from '../../household/plan';
import { shoppingFor, type ShopRow } from '../../household/shopping';
import { PEOPLE } from '../../household/types';
import { useHousehold } from '../../store/household';
import { amount, DAY_NAMES, packLabel, relativeDay, rub, stepOf } from './format';
import { ChipView, DayStrip, HBar, QtyEditor, SyncLine } from './parts';

const dishName = (title: string): string => title.split(',')[0]!.toLowerCase();
const capital = (text: string): string => text[0]!.toUpperCase() + text.slice(1);
/** Сегодня и шесть дней вперёд: на прошлое покупки не планируют. */
const DAYS_AHEAD = 7;

export function ShopScreen(): JSX.Element {
  const today = useHousehold((s) => s.today);
  const view = useHousehold((s) => s.view);
  const me = useHousehold((s) => s.local.me) ?? 'max';
  const setPurchase = useHousehold((s) => s.setPurchase);
  const setStock = useHousehold((s) => s.setStock);
  const [editing, setEditing] = useState<string | null>(null);
  const [stockEditing, setStockEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<DateStr | null>(null);

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
  // Выбранный день уехал в прошлое, пока экран был открыт, — вернуться к сегодня
  const date = picked && picked >= today ? picked : today;
  const isToday = date === today;
  const when = relativeDay(date, today);
  const next = addDays(date, 1);

  const shop = shoppingFor(PLAN, view, date, me, today);
  const recipes = recipesOf(PLAN, weekKeyOf(date));
  const following = recipesOf(PLAN, weekKeyOf(next));
  const partner = PEOPLE.find((p) => p.id !== me)!;

  const rowView = (r: ShopRow): JSX.Element => {
    const u = r.p.unit;
    const other = Math.round((r.got - r.mine) * 100) / 100;
    const whoBought =
      other > 0 && r.mine > 0
        ? ` (вы ${amount(r.mine, u)}, ${partner.name} ${amount(other, u)})`
        : other > 0
          ? ` (${partner.name})`
          : '';
    const why =
      r.status === 'todo'
        ? `нужно ${amount(r.need, u)} · ${isToday ? 'дома' : 'будет дома'} ${amount(r.haveBefore, u)}${r.cost ? ` · ≈${rub(r.cost)}` : ''}`
        : r.status === 'partial'
          ? `куплено ${amount(r.got, u)}${whoBought} · не хватает ${amount(r.short, u)}`
          : `куплено ${amount(r.got, u)}${whoBought}${r.got > r.shortBefore ? ` · с запасом ${amount(r.got - r.shortBefore, u)}` : ''}`;
    const qty = r.status === 'done' ? amount(r.got, u) : packLabel(r.suggest, r.p);
    const button = r.status === 'todo' ? 'Купил' : r.status === 'partial' ? 'Докупил' : 'Изменить';
    const isEditing = editing === r.product;
    // В поле — сколько куплено мной за сегодня всего: правка всегда про итог
    const prefill = r.mine + (r.status === 'done' ? 0 : r.suggest);
    return (
      <div key={r.product} className={`h-row ${r.status}`}>
        <span className="h-e" aria-hidden="true">
          {r.p.e}
        </span>
        <span className="nm">
          {r.p.name}
          {r.forTomorrow && (
            <span className="h-tag">{isToday ? 'на завтра' : `на ${WEEK_KEYS[weekdayOf(next)]!.toLowerCase()}`}</span>
          )}
        </span>
        <span className="qty">{qty}</span>
        <span className="why">{why}</span>
        <span className="act">{!isEditing && <button onClick={() => setEditing(r.product)}>{button}</button>}</span>
        {isEditing && (
          <QtyEditor
            id={`buy-${r.product}`}
            label={isToday ? 'Сколько купили вы за сегодня' : `Сколько купили вы на ${when.replace(/^во? /, '')}`}
            initial={prefill}
            unit={u}
            step={stepOf(r.p)}
            hint={
              <>
                Подсказка: {packLabel(r.status === 'done' ? r.mine : r.mine + r.suggest, r.p)}. Купили больше или меньше —
                впишите как есть, остаток пересчитается. Ноль убирает вашу покупку.
                {other > 0 && ` Покупку ${partner.name === 'Макс' ? 'Макса' : 'Ильвины'} правит ${partner.name}.`}
              </>
            }
            onSave={(value) => {
              setPurchase(date, r.product, value);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    );
  };

  const cooking = recipes.length
    ? `${when} готовим: ${recipes.map((r) => dishName(r.title)).join(' и ')}`
    : `${when} не готовим`;
  const then = following.length
    ? `; ${isToday ? 'завтра' : relativeDay(next, today)} — ${dishName(following[following.length - 1]!.title)}`
    : '';

  return (
    <section className="pane h-pane">
      <HBar title="Покупки" sub={DAY_NAMES[weekdayOf(date)]} />
      <div className="scroll">
        <div className="h-body">
          <DayStrip
            week={days}
            selected={date}
            today={today}
            onSelect={(d) => {
              setPicked(d);
              setEditing(null);
            }}
            dishOf={(d) => dayOf(PLAN, weekKeyOf(d)).dish}
            off={(d) => Object.keys(needsOf(PLAN, weekKeyOf(d))).length === 0}
          />

          <div className="h-card h-stack">
            <div className="h-shophead">
              <b>{shop.open ? `≈${rub(shop.cost)}` : 'Всё куплено'}</b>
              <span>
                {capital(cooking)}
                {then}
              </span>
            </div>
            <SyncLine />
          </div>

          <div className="h-card">
            <div className="h-label">Купить {when}</div>
            <div className="h-rows">
              {shop.must.length ? (
                shop.must.map(rowView)
              ) : (
                <p className="h-note pad">{isToday ? 'Всё нужное для готовки уже дома.' : 'К этому дню всё нужное будет дома.'}</p>
              )}
            </div>
          </div>

          {shop.pantry.length > 0 && (
            <div className="h-card">
              <div className="h-label">Проверьте запасы</div>
              <div className="h-rows">{shop.pantry.map(rowView)}</div>
            </div>
          )}

          {shop.enough.length > 0 && (
            <div className="h-card">
              <div className="h-label">{isToday ? 'Уже есть дома' : 'Будет дома'}</div>
              <div className="h-chips top">
                {shop.enough.map((r) => (
                  <ChipView
                    key={r.product}
                    chip={{ e: r.p.e, name: r.p.short, amt: `нужно ${amount(r.need, r.p.unit)}`, sub: `дома ${amount(r.haveBefore + r.got, r.p.unit)}` }}
                  />
                ))}
              </div>
            </div>
          )}

          <details className="h-card h-more">
            <summary>Остатки дома</summary>
            <p className="h-note top">
              Покупки прибавляют, записанная готовка списывает. Если дома на самом деле другое количество — нажмите на
              продукт и впишите, сколько есть.
            </p>
            <div className="h-rows">
              {Object.entries(PLAN.catalog).map(([id, p]) => {
                const have = view.stock[id] ?? 0;
                const isEditing = stockEditing === id;
                return (
                  <div key={id} className="h-row stock">
                    <span className="h-e" aria-hidden="true">
                      {p.e}
                    </span>
                    <span className="nm">{p.short}</span>
                    <span className="qty">{amount(have, p.unit)}</span>
                    <span className="why">{p.kind === 'pantry' ? 'запас' : 'под готовку'}</span>
                    <span className="act">{!isEditing && <button onClick={() => setStockEditing(id)}>Поправить</button>}</span>
                    {isEditing && (
                      <QtyEditor
                        id={`stock-${id}`}
                        label="Сколько дома на самом деле"
                        initial={have}
                        unit={p.unit}
                        step={stepOf(p)}
                        onSave={(value) => {
                          setStock(id, value);
                          setStockEditing(null);
                        }}
                        onCancel={() => setStockEditing(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </details>

          <details className="h-card h-more">
            <summary>Список на неделю целиком</summary>
            {PLAN.weekly.map((g) => (
              <div key={g.group} className="h-week">
                <h3>{g.group}</h3>
                {g.items.map((i) => (
                  <div key={i.name} className="h-wrow">
                    <span>{i.name}</span>
                    <span>{i.qty}</span>
                    <span>{i.price}</span>
                  </div>
                ))}
              </div>
            ))}
          </details>
        </div>
      </div>
    </section>
  );
}
