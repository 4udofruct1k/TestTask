# ARMOR_SPEC — мод «Подсветка брони» для «Мира танков» (Lesta)

Инструкция для Claude Code. Прочитай файл целиком до начала работы. Цель — рабочий прототип: мод собирается в `.mtmod`, загружается клиентом «Мира танков» 1.45.0.0 и в бою раскрашивает область вокруг точки прицеливания по вероятности пробития.

---

## 0. Контекст

**Что делаем.** Аналог функции «Подсветка брони» из World of Tanks 2.0 (внутреннее имя у WG — ArmorFlashlight). В снайперском режиме, по вражеской цели, в области вокруг круга сведения каждая точка брони окрашивается:
- зелёный — пробитие гарантировано;
- жёлтый — пробитие зависит от разброса;
- красный — пробития не будет.

**Почему не порт кода WG.** В клиенте WG Python-код (`gui/armor_flashlight/battle_controller.py`) — только обвязка. Он собирает параметры брони и выстрела и передаёт их в `armor_flashlight.ArmorFlashlightSingleton`. Это нативный CGF-компонент: трассировка и шейдерная раскраска модели происходят в нём, исходников нет. В клиенте Лесты модуля `armor_flashlight` нет вообще. Поэтому пишем свою реализацию на чистом Python поверх ванильного расчёта пробития Лесты (`_CrosshairShotResults`). Код WG используется только как справка по поведению и параметрам. Копировать его нельзя.

**Статус по правилам Лесты.** В статье «Запрещённые модификации клиента» анализ брони в бою выделен в отдельную категорию. Сейчас он не запрещён, но Леста планирует запрет после выхода собственного инструмента. Наказания за запрещённые моды: 7 дней, 30 дней, перманент. Риск несёт владелец аккаунта. Мод делается для личной проверки.

---

## 1. Окружение

- ОС: Windows, на машине установлен клиент «Мир танков».
- **Путь к игре не угадывать — спросить у пользователя.** Мод кладётся в `<игра>/mods/<версия_клиента>/`. Имя папки версии посмотри среди уже существующих папок в `<игра>/mods/`.
- Логи: `<игра>/python.log`. Весь вывод мода (`print` или `logging`) ищи там.
- **Python 2.7** — клиент на 2.7, и `.pyc` должны быть скомпилированы 2.7. Проверь `python --version`. Если в PATH другая версия, найди 2.7 или попроси пользователя поставить.
- 7-Zip — для упаковки.
- **Исходники клиента для сверки API** (только чтение, в мод не упаковываются):
  ```
  git clone --depth 1 --branch RU https://github.com/IzeBerg/wot-src wot-src
  ```
  Ветка `RU` — декомпиляция клиента Лесты. Сверено на коммите `v.1.45.0.0 #2284`. Если версия клиента у пользователя другая, возьми соответствующий коммит и перепроверь раздел 3. Ветка `EU` — клиент WG, нужна только для справки.

---

## 2. Поведение (MVP)

### 2.1. Когда подсветка активна

Все условия должны выполняться одновременно:
1. Игрок в бою, его танк жив.
2. Режим управления — снайперский: `player.inputHandler.ctrlModeName == CTRL_MODE_NAME.SNIPER`.
3. Под маркером прицела вражеская живая машина: `collision.entity` — это `Vehicle`, `health > 0`, команда не своя.
4. Дистанция от своего танка до точки прицеливания не больше `maxDistance` (по умолчанию 300 м).
5. Свой танк стоит: скорость меньше `stillSpeed` (по умолчанию 0.5 м/с) дольше `appearDelay` (по умолчанию 0.5 с).
6. Пользователь не выключил подсветку клавишей.

Если хоть одно условие нарушено, оверлей скрывается сразу.

### 2.2. Область и сетка

- Центр области — экранная проекция точки прицеливания: `cameras.projectPoint(position)` → clip-координаты x, y.
- Радиус равен радиусу круга сведения на экране, умноженному на `aimingCircleAdjustment` (1.15). В clip-координатах по вертикали:
  `r_y = tan(dispAngle) / tan(fov / 2) * 1.15`, где `dispAngle = player.gunRotator.getCurShotDispersionAngles()[0]`, `fov = BigWorld.projection().fov`.
  По горизонтали `r_x = r_y / aspect`, где `aspect = cameras.getScreenAspectRatio()`.
- Ограничение сверху: диаметр не больше `maxSizePercentOfWindow` (28%) высоты окна, то есть `r_y ≤ 0.28`.
- Сетка квадратная, шаг `cellPx` пикселей (по умолчанию 10). Перевод шага в clip: `2 * cellPx / screenW` и `2 * cellPx / screenH`, размер экрана — `BigWorld.screenSize()`. В выборку попадают только точки внутри эллипса.
- Точек не больше `maxSamples` (по умолчанию 250). Если получается больше, увеличь шаг.

### 2.3. Расчёт одной точки

```python
ray, start = cameras.getWorldRayAndPoint(x, y)      # ray не нормирован
ray.normalise()
end = start + ray.scale(dist + 50.0)
res = collideDynamicAndStatic(start, end, (player.playerVehicleID,))
if res is None or res[1] is None or res[1].entity is not target:
    -> точка пустая (перекрыта укрытием, промах мимо цели и т.п.)
hitPoint, collData = res
result = _CrosshairShotResults.getShotResult(
    hitPoint, collData, shellDir,
    excludeTeam=myTeam, piercingMultiplier=piercingMultiplier)
```

- `shellDir` — направление `direction` из последнего `onGunMarkerStateChanged`, нормированное. Внутри маленькой области оно одно на все точки, как у WG.
- `collideDynamicAndStatic` учитывает статику: части цели за камнем получат пустую точку, а не цвет.
- `getShotResult` сам делает `entity.collideSegmentExt(...)` вдоль `shellDir` и проходит все слои брони: экраны, нормализацию, рикошеты, правила 2 и 3 калибров, разброс ±25%, кумулятивы, современные ОФ. Эту логику **не переписывать**, только вызывать.
- `piercingMultiplier`: подписка на `feedback.onVehicleFeedbackReceived(eventID, _, value)`; при `eventID == FEEDBACK_EVENT_ID.VEHICLE_ATTRS_CHANGED` взять `value.get('gunPiercing', 1)`. Так же делает ванильный `ShotResultIndicatorPlugin`.

### 2.4. Цвета и прозрачность

| Результат | Обычная схема | Для дальтоников |
|---|---|---|
| `GREAT_PIERCED` | `#008015` | `#ffcc33` |
| `LITTLE_PIERCED` | `#bba737` | `#d568e3` |
| `NOT_PIERCED` | `#8c0712` | `#6025b4` |
| `UNDEFINED` | не рисовать | не рисовать |

Цвета взяты из `armor_flashlight_config.xml` WG. Схема для дальтоников — по настройке `GRAPHICS.COLOR_BLIND` (фаза 3).

Итоговая альфа = `opacity` (по умолчанию 0.45) × `alphaByDist` × `aimFactor`, где:
- `alphaByDist` = 1 до 200 м, линейно падает до 0 к 300 м;
- `aimFactor = min(1, (gun.shotDispersionAngle / dispAngle) ** 3.0)` — подсветка тускнеет, пока прицел не сведён. `gun.shotDispersionAngle` берётся из `player.getVehicleDescriptor().gun`.

### 2.5. Обновление

- `onGunMarkerStateChanged` приходит часто. В обработчике **только сохраняй состояние** (position, direction, collision по типу маркера), ничего не считай.
- Пересчёт сетки — в тике через `BigWorld.callback(updateInterval, ...)`, `updateInterval` по умолчанию 0.1 с.
- Тип маркера: если в `gunMarkersFlags` стоит `GUN_MARKER_FLAG.SERVER_MODE_ENABLED`, используй серверный маркер, иначе клиентский.
- Логируй время каждого пересчёта в `python.log` (в debug-режиме). Бюджет — ≤ 4 мс. Если выходит больше, уменьшай `maxSamples` или увеличивай шаг.

### 2.6. Управление

- Переключение вкл/выкл — клавиша `toggleKey`, по умолчанию `Keys.KEY_Y` (как у WG). Подписка: `gui.InputHandler.g_instance.onKeyDown(event)`, код клавиши — `event.key`. Событие приходит только на нажатие. Проверь, что Y не занята в раскладке клиента; если занята, возьми свободную и сообщи пользователю.
- В начале боя состояние — «включено».

---

## 3. Проверенные API клиента 1.45.0.0

Все пути относительно `wot-src/sources/res/scripts/client/`. Если что-то не сходится с установленным клиентом, **не угадывай**: найди актуальное имя в `wot-src` и сообщи пользователю о расхождении.

| Что | Где | Примечание |
|---|---|---|
| Загрузка модов | `gui/mods/__init__.py` | Грузит модули `mod_*.pyc` из `gui/mods/`, вызывает `init()` и `fini()` |
| События аватара | `PlayerEvents.py` → `g_playerEvents.onAvatarReady`, `onAvatarBecomeNonPlayer` | Старт и стоп контроллера |
| Сессия боя | `dependency.instance(IBattleSessionProvider)` (`skeletons.gui.battle_session`) | `.shared.crosshair`, `.shared.feedback` |
| Маркер прицела | `gui/battle_control/controllers/crosshair_proxy.py` → `onGunMarkerStateChanged(markerType, position, direction, collision)`, `onCrosshairViewChanged(viewID)` | **Сигнатура отличается от WG**: у WG вторым аргументом идёт объект `gunMarkerState`, у Лесты — три отдельных значения |
| Ванильный индикатор (образец подписок) | `gui/Scaleform/daapi/view/battle/shared/crosshair/plugins.py` → `ShotResultIndicatorPlugin` | Читать как образец, не импортировать |
| Расчёт пробития | `AvatarInputHandler/gun_marker_ctrl.py` → `_CrosshairShotResults.getShotResult(hitPoint, collision, direction, excludeTeam=0, piercingMultiplier=1)` | Из `collision` берёт только `.entity`. Отладочные побочные эффекты работают только при `IS_DEVELOPMENT` |
| Результаты | `aih_constants.SHOT_RESULT`: `UNDEFINED=0`, `NOT_PIERCED=1`, `LITTLE_PIERCED=2`, `GREAT_PIERCED=3` | |
| Режимы управления | `aih_constants.CTRL_MODE_NAME.SNIPER == 'sniper'` | |
| Флаги маркеров | `aih_global_binding.bindRO(BINDING_ID.GUN_MARKERS_FLAGS)`, `aih_constants.GUN_MARKER_FLAG` | |
| Луч из экрана | `AvatarInputHandler/cameras.py` → `getWorldRayAndPoint(x, y)` → `(ray, worldPointOnNearPlane)`; `projectPoint(point)` → `Vector4` в clip; `getScreenAspectRatio()` | x, y в clip-координатах [-1, 1] |
| Коллизия с учётом статики | `ProjectileMover.py` → `collideDynamicAndStatic(start, end, exceptIDs)` → `(hitPoint, EntityCollisionData или None)` | `EntityCollisionData.entity` — это `Vehicle` |
| Слои брони | `Vehicle.collideSegmentExt(start, end)` → список `SegmentCollisionResultExt(dist, hitAngleCos, matInfo, compName)` | Вызывается внутри `getShotResult` |
| Разброс | `player.gunRotator.getCurShotDispersionAngles()[0]`; `player.getVehicleDescriptor().gun.shotDispersionAngle` | |
| Скорость, позиция | `player.getOwnVehicleSpeeds()` → `(speed, rotSpeed)`; `player.getOwnVehiclePosition()` | При движении назад `speed` отрицательная — сравнивать `abs(speed)` |
| Команда игрока | `gui/battle_control/avatar_getter.py` → `getPlayerTeam()` | |
| Модификатор пробития | `FEEDBACK_EVENT_ID.VEHICLE_ATTRS_CHANGED` из `gui/battle_control/battle_constants` | `value.get('gunPiercing', 1)` |
| 2D-оверлей | `GUI.Simple('')`, `GUI.addRoot`, `GUI.delRoot`; `.materialFX = GUI.Simple.eMaterialFX.BLEND`; `.widthMode`/`.heightMode = GUI.Simple.eSizeMode.PIXEL`; `.horizontalPositionMode`/`.verticalPositionMode = GUI.Simple.ePositionMode.CLIP`; `.colour = (r, g, b, a)` в 0–255; `.size`; `.position = (x, y, z)`; `.visible` | Примеры в `gui/DebugView.py` и grep по `ePositionMode.CLIP` |
| Размер экрана | `BigWorld.screenSize()` | |
| Клавиши | `Keys.KEY_Y`; `gui.InputHandler.g_instance.onKeyDown` | |

---

## 4. Структура проекта

```
armor-highlight/
├── ARMOR_SPEC.md
├── meta.xml
├── build.bat
├── wot-src/                          # клон для сверки API, в .gitignore
├── res/scripts/client/gui/mods/
│   ├── mod_armor_highlight.py        # точка входа: init()/fini(), подписка на g_playerEvents
│   └── armor_highlight/
│       ├── __init__.py
│       ├── config.py                 # константы и значения по умолчанию из раздела 2
│       ├── geometry.py               # чистая математика: радиус, сетка, альфа. БЕЗ импортов BigWorld/GUI
│       ├── sampler.py                # точка сетки → луч → getShotResult
│       ├── overlay.py                # пул GUI.Simple-квадратов, show/hide/update
│       └── controller.py             # подписки, условия 2.1, тик, клавиша
└── tests/
    └── test_geometry.py              # офлайн-тесты geometry.py на Python 2.7
```

`meta.xml`:
```xml
<mod>
  <name>max.armor-highlight</name>
  <description>Armor highlight in sniper mode</description>
  <version>{{VERSION}}</version>
  <author>Max</author>
</mod>
```

`build.bat` (запуск: `build.bat -v 0.1.0`):
1. Пересоздать `build/` и скопировать туда `res/`.
2. Подставить `{{VERSION}}` в `meta.xml`.
3. Выполнить `python -m compileall build` (Python 2.7).
4. Упаковать через `7z a -tzip -mx=0 max.armor-highlight_<версия>.mtmod` только `.pyc` и `meta.xml`. Структура внутри архива: `meta.xml` и `res/scripts/client/gui/mods/...`.
5. Опционально (флаг `-i`) скопировать `.mtmod` в `<игра>/mods/<версия_клиента>/`.

---

## 5. Требования к коду

- Python 2.7: без f-строк и type hints, строки форматировать через `%` или `.format()`.
- Каждый обработчик событий и тик оборачивать в `try/except` с логированием в `python.log`. Исключение в моде не должно ломать бой.
- `fini()` и остановка контроллера отписывают **все** события, отменяют callback, удаляют GUI-корни. Проверить, что после боя и повторного входа в бой ничего не дублируется.
- Не монкипатчить и не менять ванильные классы. `_CrosshairShotResults` только вызывать.
- Мод использует только данные, доступные ванильному индикатору пробития: видимую цель под прицелом и её модель. Никаких сетевых хуков и чтения скрытых данных других игроков (перезарядка, позиции вне засвета и т.п.).
- Логи с префиксом `[armor_highlight]`.

---

## 6. Фазы и критерии приёмки

Делай строго по фазам. После каждой фазы остановись, опиши, что проверить в игре, и дождись ответа пользователя: проверить в клиенте можешь не ты, а он.

**Фаза 0 — каркас.**
Мод собирается, загружается, пишет в `python.log` строки `init` и `avatar ready`. В бою в центре экрана виден один тестовый полупрозрачный квадрат `GUI.Simple`.
*Главная цель фазы — выяснить, рисуется ли `GUI.Simple` поверх боевого интерфейса Scaleform.* Если не рисуется или перекрыт, остановись и сообщи пользователю. Альтернативу (Flash-оверлей) не начинай без согласования.

**Фаза 1 — расчёт без отрисовки.**
Контроллер проверяет условия 2.1. Раз в `updateInterval` сэмплер считает сетку и пишет в лог: число точек, распределение по результатам и время пересчёта.
Проверка пользователем: навестись в снайперском режиме на борт и на лоб одной цели. Распределение должно меняться, время ≤ 4 мс.
Здесь же сверь один раз, что `dist` в `collideSegmentExt` — это метры от `startPoint`: сравни с `(hitPoint - start).length`.

**Фаза 2 — отрисовка.**
Пул квадратов `cellPx × cellPx` в clip-позициях точек сетки, цвета и альфа по 2.4, клавиша вкл/выкл, скрытие по всем условиям 2.1.
Проверка: картинка совпадает с цветом ванильного индикатора в центре прицела; при движении, выходе из снайперского режима и смерти цели оверлей исчезает; FPS заметно не падает.

**Фаза 3 — доработки (по согласованию).**
- Перепроецирование: хранить мировые `hitPoint` и каждый кадр пересчитывать их экранные позиции через `projectPoint`. Тогда подсветка «прилипает» к модели при повороте камеры между пересчётами.
- Схема для дальтоников по `GRAPHICS.COLOR_BLIND`.
- Внешний конфиг (json рядом с модом) для параметров из раздела 2.
- Сглаживание: вместо квадратов — круглая текстура с мягким краем (png в архиве).

---

## 7. Параметры по умолчанию

| Параметр | Значение | Источник |
|---|---|---|
| `maxDistance` | 300 м | поведение WG 2.0 |
| `stillSpeed` | 0.5 м/с | подобрать |
| `appearDelay` | 0.5 с | подобрать |
| `aimingCircleAdjustment` | 1.15 | config WG |
| `maxSizePercentOfWindow` | 28 | config WG |
| `fadeoffFactorWhenNotAimed` | 3.0 | config WG |
| `alphaByDist` | 1 до 200 м → 0 к 300 м | config WG |
| `opacity` | 0.45 | подобрать |
| `cellPx` | 10 | подобрать |
| `maxSamples` | 250 | подобрать |
| `updateInterval` | 0.1 с | подобрать |
| `toggleKey` | `KEY_Y` | поведение WG 2.0 |

Часть значений в конфиге WG декомпилятор потерял, а смысл некоторых полей восстановлен по названию. Считай их стартовыми и подбирай на глаз.

---

## 8. Чего не делать

- Не копировать код из ветки `EU` (WG). Только читать его как справку.
- Не угадывать имена API: всё сверять в `wot-src`, при расхождении сообщать.
- Не менять файлы клиента в `res/`, `res_mods/` и других папках игры, кроме копирования `.mtmod` в `mods/<версия>/`.
- Не переходить к следующей фазе без подтверждения пользователя.
