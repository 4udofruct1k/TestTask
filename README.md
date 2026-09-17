# Budget

Офлайновое приложение учёта бюджета. Одна валюта (RUB), без сервера и без сети,
упаковка в APK через Capacitor.

## Источник истины

[`BUDGET_SPEC.md`](BUDGET_SPEC.md) — спецификация: домен и инварианты, расчётный
движок, экраны, хранилище, сборка. Это источник истины, а не пожелание.
[`CLAUDE_CODE_PROMPT.md`](CLAUDE_CODE_PROMPT.md) — порядок работы по шагам.
[`design/mockup.html`](design/mockup.html) — прототип экранов, эталон вёрстки.

## Стек

| Слой | Решение |
|---|---|
| Сборка | Vite |
| UI | React + TypeScript (strict) |
| Состояние | Zustand |
| Графики | Собственный SVG |
| Даты | Своё, разбор строк |
| Оболочка | Capacitor 7 |
| Тесты | Vitest |

UI-китов нет. Оформление на CSS-переменных из 3.9, шрифт Golos Text лежит
в бандле и с сети не грузится.

## Структура

```
src/
  domain/      типы, деньги, даты, валидатор инвариантов   → Часть 1
  engine/      чистые расчёты                              → Часть 2
  storage/     файл, атомарная запись, бэкапы, миграции    → Часть 4
  store/       Zustand: документ и состояние интерфейса
  platform/    Capacitor: файлы, pause, статус-бар, Share  → Часть 5
  ui/          экраны, компоненты, графики, токены темы    → Часть 3
  dev/         подставной документ на полгода истории
tests/
android/       проект Capacitor
```

Жёсткое правило: `engine/` не импортирует ничего из `ui/`, `storage/` и `store/`,
а `domain/` и `engine/` не знают про конструктор `Date`. И то и другое проверяется
тестом `tests/rules.test.ts`, а не глазами.

## Разработка

```
npm install
npm run dev          # http://localhost:5173
npm test             # 210 тестов
npm run typecheck
```

Флаги режима разработки (только в `npm run dev`):

- `?demo=1` — подставной документ на полгода истории: дашборды есть на чём проверить.
- `?fresh=1` — стереть данные и посмотреть первый запуск.

Данные в браузере лежат в `localStorage`, на устройстве — в приватной директории
приложения (Capacitor Filesystem, `Directory.Data`).

## Сборка APK

Нужны JDK 21, Android SDK Platform 35 с Build-Tools и `ANDROID_HOME`, Node 20+.

```
npm run android:debug      # build + cap sync + assembleDebug
```

APK окажется в `android/app/build/outputs/apk/debug/app-debug.apk`.

Release требует подписи. Keystore создаётся один раз:

```
keytool -genkey -v -keystore budget.keystore -alias budget \
        -keyalg RSA -keysize 2048 -validity 10000
```

Рядом кладётся `android/keystore.properties` (в `.gitignore`, в репозиторий
не попадает никогда):

```
storeFile=/абсолютный/путь/budget.keystore
storePassword=…
keyAlias=budget
keyPassword=…
```

После этого `npm run android:release` подпишет сборку.

**Потерянный keystore означает, что обновить установленное приложение нельзя.**
Android не поставит APK с другой подписью поверх существующего, останется только
удалить — а удаление вычищает приватную директорию вместе со всей историей
бюджета. Keystore хранится так же надёжно, как экспорты бюджета.

## Версии

`versionCode` растёт на единицу с каждой сборкой, которая ставится на телефон.
`versionName` — человеческая строка, она же `APP_VERSION` в `src/version.ts`
и `appVersion` в конверте файла. Любое изменение `schemaVersion` обязано
поднимать `versionName`: иначе по экспортному файлу не понять, какая сборка
его написала.

## Тесты

Приёмка — кейсы из спецификации, каждый отдельным тестом с теми же числами:

- `tests/engine.test.ts` — К1…К11 из 2.14;
- `tests/storage.test.ts` — К1…К6 из 4.10;
- `tests/engine-pitfalls.test.ts` — медиана против среднего, остаток цикла SPREAD,
  ставка накопления за период;
- `tests/dates.test.ts`, `tests/money.test.ts`, `tests/validate.test.ts` — домен;
- `tests/rules.test.ts` — сторож жёстких правил.

Системные часы не мокаются нигде: `today` всегда приходит параметром, а часы
хранилища — интерфейсом `Clock`.
