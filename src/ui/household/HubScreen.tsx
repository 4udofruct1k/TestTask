/**
 * Главная с плитками. HOUSEHOLD_SPEC, раздел 8.
 *
 * Сверху большая «Покупки» — то, за чем открывают приложение днём.
 * Под ней разделы поменьше: «Бюджет», «Готовка», «Питание»,
 * «Тренировка» и широкая «Здоровье». Новые разделы встают сюда же плитками.
 */

import type { JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatAmount } from '../../domain/money';
import { budgetGauge } from '../../engine';
import { weekKeyOf } from '../../household/days';
import { kcalOf, PLAN, recipesOf } from '../../household/plan';
import { shoppingFor } from '../../household/shopping';
import { PEOPLE } from '../../household/types';
import { dayRow } from '../../personal/energy';
import { plannedKcal, trainingDay } from '../../personal/training';
import { useBudget } from '../../store/budget';
import { useHousehold } from '../../store/household';
import { usePersonal } from '../../store/personal';
import { useUi } from '../../store/ui';
import { IconMoon, IconSettings, IconSun } from '../icons';
import { dec, longDate, num, positionsWord, rub, signedKcal } from './format';
import { useSyncText } from './parts';

export function HubScreen(): JSX.Element {
  const { go, theme, toggleTheme } = useUi();
  const today = useHousehold((s) => s.today);
  const view = useHousehold((s) => s.view);
  const me = useHousehold((s) => s.local.me);
  const setMe = useHousehold((s) => s.setMe);
  const loadNote = useHousehold((s) => s.loadNote);
  const saveError = useHousehold((s) => s.saveError);
  const budgetDoc = useBudget((s) => s.doc);
  const budgetToday = useBudget((s) => s.today);
  const personal = usePersonal((s) => s.doc);
  const sync = useSyncText();

  const key = weekKeyOf(today);
  const shop = shoppingFor(PLAN, view, today, me ?? 'max');
  const open = shop.must.filter((r) => r.status !== 'done');
  const recipes = recipesOf(PLAN, key);
  const left = budgetDoc ? budgetGauge(budgetDoc, monthKeyOf(budgetToday), budgetToday).left : null;

  const who = me ?? 'max';
  const mine = personal.people[who];
  const workout = trainingDay(who, key);
  const workoutDone = mine.done[today];
  const health = dayRow(PLAN, who, mine, today, today);
  const lastWeight = [...mine.measurements].reverse().find((m) => m.weight !== undefined)?.weight;

  return (
    <section className="pane h-pane">
      <div className="scroll">
        <div className="h-body">
          <div className="h-hello">
            <div>
              <small>{longDate(today)}</small>
              <h1>Дом на двоих</h1>
            </div>
            <button className="h-icon" aria-label="Сменить тему" onClick={toggleTheme}>
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
            <button className="h-icon" aria-label="Общие данные и облако" onClick={() => go('household')}>
              <IconSettings />
            </button>
          </div>

          {/* Молчаливой правки не бывает: что случилось с файлом — видно */}
          {(loadNote || saveError) && (
            <div className="h-card">
              <p className="h-note">{saveError ? `Изменения не записались в телефон: ${saveError}` : loadNote}</p>
            </div>
          )}

          {me === null && (
            <div className="h-card h-who">
              <b>Чей это телефон?</b>
              <p className="h-note">
                Покупки отмечаются от имени хозяина телефона, а «Питание» открывается на его вкладке. Поменять можно
                в настройках.
              </p>
              <div className="h-seg">
                {PEOPLE.map((p) => (
                  <button key={p.id} onClick={() => setMe(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="h-tiles">
            <button className="h-tile big" onClick={() => go('shop')}>
              <span className="t">Покупки</span>
              <span className="s">
                {open.length === 0 ? 'На сегодня всё куплено' : `Купить сегодня: ${open.length} ${positionsWord(open.length)}`}
              </span>
              {shop.cost > 0 && <span className="h-total">≈{rub(shop.cost)}</span>}
              <span className="peek">
                {open.slice(0, 4).map((r) => (
                  <span key={r.product}>
                    {r.p.e} {r.p.short}
                  </span>
                ))}
              </span>
              <span className="pic" aria-hidden="true">
                🛒
              </span>
            </button>

            <button className="h-tile money" onClick={() => go('home')}>
              <span className="t">Бюджет</span>
              <span className="s">
                {left === null ? (
                  'свой у каждого'
                ) : (
                  <>
                    осталось
                    <br />
                    {formatAmount(left)}&nbsp;₽
                  </>
                )}
              </span>
              <span className="pic" aria-hidden="true">
                💰
              </span>
            </button>

            <button className="h-tile cook" onClick={() => go('cook')}>
              <span className="t">Готовка</span>
              <span className="s">{recipes.length ? recipes[recipes.length - 1]!.title.split(',')[0] : 'сегодня отдыхаем'}</span>
              <span className="pic" aria-hidden="true">
                🍳
              </span>
            </button>

            <button className="h-tile food" onClick={() => go('food')}>
              <span className="t">Питание</span>
              <span className="s">
                ккал сегодня
                {PEOPLE.map((p) => (
                  <span key={p.id} className="line">
                    {p.name} {num(kcalOf(PLAN, p.id, key))}
                  </span>
                ))}
              </span>
              <span className="pic" aria-hidden="true">
                🥗
              </span>
            </button>

            <button className="h-tile train" onClick={() => go('training')}>
              <span className="t">Тренировка</span>
              <span className="s">
                {workout ? (
                  <>
                    {workout.title.toLowerCase()}
                    <span className="line">
                      {workoutDone !== undefined ? `✓ ${num(workoutDone)} ккал` : `≈${num(plannedKcal(who, key, mine.kcal))} ккал`}
                    </span>
                  </>
                ) : (
                  'план появится позже'
                )}
              </span>
              <span className="pic" aria-hidden="true">
                {workout?.emoji ?? '🏃'}
              </span>
            </button>

            <button className="h-tile health" onClick={() => go('health')}>
              <span className="t">Здоровье</span>
              <span className="s">
                {health.energy ? (
                  <>
                    сегодня {signedKcal(health.energy.balance)} ккал
                    <span className="line">
                      {lastWeight !== undefined && `вес ${dec(lastWeight)} кг · `}
                      расход {num(health.energy.total)}
                    </span>
                  </>
                ) : (
                  'впишите вес и жир — посчитаю расход'
                )}
              </span>
              <span className="pic" aria-hidden="true">
                ⚖️
              </span>
            </button>
          </div>

          <button className="h-sync" onClick={() => go('household')}>
            <span className={`h-dot${sync.error ? ' err' : sync.waiting || !sync.connected ? ' wait' : ''}`} />
            <b>{sync.text}</b>
            <span>
              Покупки, готовка и остатки сводятся раз в сутки: при первом открытии после трёх ночи, по очереди. Нужно
              раньше — «Обновить» в «Покупках». Бюджет никуда не уходит.
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
