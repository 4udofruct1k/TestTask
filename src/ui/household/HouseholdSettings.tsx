/**
 * Общие данные и облако. HOUSEHOLD_SPEC, раздел 6.
 *
 * Чей телефон и куда сводиться. Облако настраивает один человек: создаёт
 * функцию, вставляет её адрес, создаёт ключ — и пересылает второму
 * телефону код подключения одной строкой.
 */

import { useState, type JSX } from 'react';
import { connectionCode, makeKey, parseConnection } from '../../household/sync';
import { PEOPLE } from '../../household/types';
import { copyText, shareText } from '../../platform';
import { useHousehold } from '../../store/household';
import { HBar, useSyncText } from './parts';

const GUIDE_URL = 'https://github.com/4udofruct1k/TestTask/blob/claude/repo-cleanup-hnmqr8/cloud/README.md';

const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

function CodeBox({ label, value }: { label: string; value: string }): JSX.Element {
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="h-code">
      <small>{label}</small>
      <input readOnly value={value} onFocus={(e) => e.target.select()} aria-label={label} />
      <div className="h-editline">
        <button
          className="h-save"
          onClick={() => void copyText(value).then((ok) => setDone(ok ? 'Скопировано' : 'Выделите и скопируйте вручную'))}
        >
          Скопировать
        </button>
        <button
          className="h-cancel"
          onClick={() => void shareText(label, value).then((ok) => !ok && setDone('Поделиться здесь нельзя — скопируйте'))}
        >
          Поделиться
        </button>
      </div>
      {done && <small className="ok">{done}</small>}
    </div>
  );
}

export function HouseholdSettings(): JSX.Element {
  const local = useHousehold((s) => s.local);
  const syncing = useHousehold((s) => s.syncing);
  const setMe = useHousehold((s) => s.setMe);
  const setSync = useHousehold((s) => s.setSync);
  const syncNow = useHousehold((s) => s.syncNow);
  const sync = useSyncText();

  const [mode, setMode] = useState<'code' | 'setup'>('code');
  const [pasted, setPasted] = useState('');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const connect = async (code: string): Promise<void> => {
    const config = parseConnection(code);
    if (!config) {
      setMessage('Код не похож на код подключения: нужна строка вида https://…#ключ');
      return;
    }
    setSync(config);
    setMessage(null);
    const error = await syncNow();
    setMessage(error ?? 'Подключено, данные сведены');
  };

  return (
    <section className="pane h-pane">
      <HBar title="Общие данные" />
      <div className="scroll">
        <div className="h-body">
          <div className="h-card h-stack">
            <div className="h-label">Чей это телефон</div>
            <div className="h-seg">
              {PEOPLE.map((p) => (
                <button key={p.id} aria-pressed={local.me === p.id} onClick={() => setMe(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
            <p className="h-note">
              От этого имени отмечаются покупки, на этой вкладке открывается «Питание». Каждый правит только свои покупки.
            </p>
          </div>

          {local.sync ? (
            <div className="h-card h-stack">
              <div className="h-label">Облако</div>
              <div className="h-status">
                <span className={`h-dot${sync.error ? ' err' : sync.waiting ? ' wait' : ''}`} />
                <b>{sync.text}</b>
              </div>
              <p className="h-note">
                Сводится само раз в сутки — при первом открытии после трёх ночи. Сначала уходят свои изменения, потом
                приходят общие. Два телефона сводятся по очереди: облако применяет изменения по одному и ничего не
                теряет.
              </p>
              <button className="h-btn" disabled={syncing} onClick={() => void syncNow().then((e) => setMessage(e))}>
                {syncing ? 'Сводим…' : 'Обновить сейчас'}
              </button>
              {message && <p className="h-note">{message}</p>}
              <CodeBox label="Код для второго телефона" value={connectionCode(local.sync)} />
              {confirmOff ? (
                <div className="h-editline">
                  <button
                    className="h-save danger"
                    onClick={() => {
                      setSync(null);
                      setConfirmOff(false);
                    }}
                  >
                    Отключить
                  </button>
                  <button className="h-cancel" onClick={() => setConfirmOff(false)}>
                    Отмена
                  </button>
                </div>
              ) : (
                <button className="h-btn quiet" onClick={() => setConfirmOff(true)}>
                  Отключить облако
                </button>
              )}
            </div>
          ) : (
            <div className="h-card h-stack">
              <div className="h-label">Облако</div>
              <p className="h-note">
                Пока облако не подключено, покупки и готовка видны только на этом телефоне и копятся в очереди. После
                подключения очередь уйдёт в облако целиком.
              </p>
              <div className="h-seg">
                <button aria-pressed={mode === 'code'} onClick={() => setMode('code')}>
                  Мне прислали код
                </button>
                <button aria-pressed={mode === 'setup'} onClick={() => setMode('setup')}>
                  Настраиваю сам
                </button>
              </div>

              {mode === 'code' ? (
                <>
                  <textarea
                    className="h-input"
                    rows={3}
                    placeholder="https://functions.yandexcloud.net/…#ключ"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                  />
                  <button className="h-btn" disabled={syncing || pasted.trim() === ''} onClick={() => void connect(pasted)}>
                    Подключить
                  </button>
                </>
              ) : (
                <ol className="h-steps">
                  <li>
                    Создайте базу и функцию в Яндекс Облаке по{' '}
                    <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer">
                      инструкции
                    </a>
                    . Это минут пятнадцать и бесплатно при нашем объёме.
                  </li>
                  <li>
                    Вставьте ссылку на функцию:
                    <input
                      className="h-input"
                      inputMode="url"
                      placeholder="https://functions.yandexcloud.net/d4e…"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </li>
                  <li>
                    Создайте ключ и вставьте его в функцию, в переменную <code>HOUSEHOLD_KEY</code>:
                    {key ? (
                      <CodeBox label="Ключ" value={key} />
                    ) : (
                      <button className="h-btn ghost" onClick={() => setKey(makeKey(randomBytes))}>
                        Создать ключ
                      </button>
                    )}
                  </li>
                  <li>
                    Подключитесь — телефон сразу сведётся с облаком:
                    <button
                      className="h-btn"
                      disabled={syncing || !key || !url.trim()}
                      onClick={() => void connect(connectionCode({ url: url.trim(), key }))}
                    >
                      Подключить
                    </button>
                  </li>
                </ol>
              )}
              {message && <p className="h-note">{message}</p>}
            </div>
          )}

          <p className="h-note pad">
            Бюджет в облако не уходит: он у каждого свой и хранится только в его телефоне. Общие здесь только покупки,
            готовка и остатки продуктов.
          </p>
        </div>
      </div>
    </section>
  );
}
