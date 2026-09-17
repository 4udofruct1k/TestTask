/**
 * Настройки. Раздел 3.8, плюс восстановление из бэкапа (4.4).
 */

import { useEffect, useState, type JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatAmountExact, formatRub, parseAmount } from '../../domain/money';
import { targetAt } from '../../engine';
import { currentRepository, useBudget } from '../../store/budget';
import { useUi } from '../../store/ui';
import { TopBar } from '../components/TopBar';
import { Sheet } from '../components/Sheet';
import { AmountChoiceSheet } from '../components/AmountChoiceSheet';
import { IconChevron } from '../icons';
import { PRESETS, ROLES } from '../palette';
import { ColorsSheet } from './ColorsSheet';
import { activeCategories, days as daysWord, months as monthsWord, monthTitleLower } from '../format';
import type { BackupInfo } from '../../storage';
import { exportDocument } from '../../platform';

type Dialog = 'target' | 'balance' | 'firstMonth' | 'forecastDay' | 'window' | 'categories' | 'colors' | 'transfer' | 'backups' | 'onboarding' | null;

export function SettingsScreen(): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const today = useBudget((s) => s.today);
  const setMonthlyTarget = useBudget((s) => s.setMonthlyTarget);
  const correctMonthlyTarget = useBudget((s) => s.correctMonthlyTarget);
  const updateSettings = useBudget((s) => s.updateSettings);
  const replaceDocument = useBudget((s) => s.replaceDocument);
  const { go, setOnboarding, palette } = useUi();
  const paletteName =
    PRESETS.find((preset) => ROLES.every((role) => preset.palette[role.id] === palette[role.id]))?.title ??
    'свои';

  const [dialog, setDialog] = useState<Dialog>(null);
  const month = monthKeyOf(today);
  const target = targetAt(doc, month);
  const activeTargetMonth = [...doc.settings.targets].reverse().find((t) => t.fromMonth <= month)?.fromMonth ?? month;

  const rows: { title: string; value: string; dialog: Dialog }[] = [
    { title: 'Цель по накоплению', value: target === null ? 'не задана' : `${formatRub(target)} в месяц`, dialog: 'target' },
    { title: 'Стартовая сумма', value: formatRub(doc.settings.startingBalance), dialog: 'balance' },
    { title: 'Первый месяц учёта', value: monthTitleLower(doc.settings.firstMonth), dialog: 'firstMonth' },
    { title: 'Прогноз показывать', value: `с ${doc.settings.forecastMinDay}-го числа`, dialog: 'forecastDay' },
    { title: 'Окно среднего по разовым', value: monthsWord(doc.settings.oneOffWindow), dialog: 'window' },
    { title: 'Категории', value: activeCategories(doc.categories.filter((c) => !c.archived).length), dialog: 'categories' },
    { title: 'Цвета', value: paletteName, dialog: 'colors' },
    { title: 'Экспорт и импорт', value: 'файл на устройство', dialog: 'transfer' },
    { title: 'Восстановление из снимка', value: 'суточные копии', dialog: 'backups' },
    { title: 'Пройти первый запуск заново', value: 'зарплата, платежи, цель', dialog: 'onboarding' },
  ];

  return (
    <section className="pane">
      <TopBar title="Настройки" onBack={() => go('home')} />
      <div className="scroll">
        <div className="elist">
          <div className="rows">
            {rows.map((row) => (
              <button
                className="setrow"
                key={row.title}
                onClick={() => (row.dialog === 'onboarding' ? setOnboarding(true) : setDialog(row.dialog))}
              >
                <span className="row-txt">
                  <span className="row-t">{row.title}</span>
                  <span className="row-s">{row.value}</span>
                </span>
                <span className="chev">
                  <IconChevron />
                </span>
              </button>
            ))}
          </div>

          <p className="hint" style={{ padding: '14px 2px 0' }}>
            Данные лежат только на этом устройстве. Удаление приложения уносит всё —
            единственная защита от потери истории это выгруженный файл.
          </p>
        </div>
      </div>

      {/* Цель по накоплению правится тем же диалогом, что и постоянная позиция (3.4) */}
      {target !== null ? (
        <AmountChoiceSheet
          open={dialog === 'target'}
          title="Цель по накоплению"
          current={target}
          effectiveMonth={month}
          currentPeriodMonth={activeTargetMonth}
          onForward={(amount) => setMonthlyTarget(month, amount)}
          onCorrect={(amount) => correctMonthlyTarget(activeTargetMonth, amount)}
          onClose={() => setDialog(null)}
        />
      ) : (
        <AmountSheet
          open={dialog === 'target'}
          title="Цель по накоплению"
          label="Сколько откладывать каждый месяц"
          initial={0}
          onSave={(amount) => setMonthlyTarget(month, amount)}
          onClose={() => setDialog(null)}
        />
      )}

      <AmountSheet
        open={dialog === 'balance'}
        title="Стартовая сумма"
        label="Сколько было накоплено к первому месяцу учёта"
        hint="Приложение не знает про ваши счета. Эта цифра нужна только запасу прочности и подписывается как «по данным учёта»."
        initial={doc.settings.startingBalance}
        allowZero
        onSave={(amount) => updateSettings({ startingBalance: amount })}
        onClose={() => setDialog(null)}
      />

      <MonthSheet
        open={dialog === 'firstMonth'}
        title="Первый месяц учёта"
        initial={doc.settings.firstMonth}
        onSave={(value) => updateSettings({ firstMonth: value })}
        onClose={() => setDialog(null)}
      />

      <NumberSheet
        open={dialog === 'forecastDay'}
        title="С какого дня показывать прогноз"
        label="День месяца"
        hint="Раньше этого дня прогноз держится на одной-двух тратах и пугает без основания."
        initial={doc.settings.forecastMinDay}
        min={1}
        max={28}
        suffix={(n) => `с ${n}-го числа`}
        onSave={(value) => updateSettings({ forecastMinDay: value })}
        onClose={() => setDialog(null)}
      />

      <NumberSheet
        open={dialog === 'window'}
        title="Окно среднего по разовым"
        label="Сколько полных месяцев брать"
        initial={doc.settings.oneOffWindow}
        min={1}
        max={24}
        suffix={(n) => monthsWord(n)}
        onSave={(value) => updateSettings({ oneOffWindow: value })}
        onClose={() => setDialog(null)}
      />

      <CategoriesSheet open={dialog === 'categories'} onClose={() => setDialog(null)} />
      <ColorsSheet open={dialog === 'colors'} onClose={() => setDialog(null)} />
      <TransferSheet open={dialog === 'transfer'} onClose={() => setDialog(null)} onImported={replaceDocument} />
      <BackupsSheet open={dialog === 'backups'} onClose={() => setDialog(null)} onRestored={replaceDocument} />
    </section>
  );
}

function AmountSheet({
  open,
  title,
  label,
  hint,
  initial,
  allowZero,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  hint?: string;
  initial: number;
  allowZero?: boolean;
  onSave(amount: number): void;
  onClose(): void;
}): JSX.Element {
  const [raw, setRaw] = useState('');
  useEffect(() => {
    if (open) setRaw(initial === 0 ? '' : formatAmountExact(initial).replace(/ /g, ''));
  }, [open, initial]);

  const amount = parseAmount(raw);
  const valid = amount !== null && (allowZero ? amount >= 0 : amount > 0);

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="field">
        <label htmlFor="samount">{label}</label>
        <input id="samount" inputMode="decimal" value={raw} placeholder="0" onChange={(e) => setRaw(e.target.value)} />
      </div>
      {hint && <p className="hint">{hint}</p>}
      <button className="save" disabled={!valid} onClick={() => { if (amount !== null) { onSave(amount); onClose(); } }}>
        Сохранить
      </button>
    </Sheet>
  );
}

function MonthSheet({
  open,
  title,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  initial: string;
  onSave(value: string): void;
  onClose(): void;
}): JSX.Element {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="field">
        <label htmlFor="smonth">Месяц</label>
        <input id="smonth" type="month" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <p className="hint">Месяцы раньше этого в приложении не показываются.</p>
      <button className="save" onClick={() => { onSave(value); onClose(); }}>
        Сохранить
      </button>
    </Sheet>
  );
}

function NumberSheet({
  open,
  title,
  label,
  hint,
  initial,
  min,
  max,
  suffix,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  hint?: string;
  initial: number;
  min: number;
  max: number;
  suffix(n: number): string;
  onSave(value: number): void;
  onClose(): void;
}): JSX.Element {
  const [value, setValue] = useState(String(initial));
  useEffect(() => {
    if (open) setValue(String(initial));
  }, [open, initial]);

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= min && parsed <= max;

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="field">
        <label htmlFor="snum">{label}</label>
        <input id="snum" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
        {valid && <p className="hint">{suffix(parsed)}</p>}
      </div>
      {hint && <p className="hint">{hint}</p>}
      <button className="save" disabled={!valid} onClick={() => { onSave(parsed); onClose(); }}>
        Сохранить
      </button>
    </Sheet>
  );
}

/** Категории с их видом потока по умолчанию (3.8). */
function CategoriesSheet({ open, onClose }: { open: boolean; onClose(): void }): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  return (
    <Sheet open={open} title="Категории" onClose={onClose}>
      {doc.categories
        .filter((c) => !c.archived)
        .map((category) => (
          <div className="sub-i" key={category.id}>
            <span className="sub-n">
              {category.icon} {category.name}
              <span className="sub-d">
                {category.kind === 'INCOME' ? 'доход' : category.defaultFlow === 'ROUTINE' ? 'рутина' : 'разовое'}
              </span>
            </span>
          </div>
        ))}
      <p className="hint">
        Вид потока подставляется при вводе автоматически и переопределяется в самой операции:
        обычный обед в кафе — рутина, день рождения в том же кафе — разовое.
      </p>
    </Sheet>
  );
}

function TransferSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose(): void;
  onImported(doc: Parameters<ReturnType<typeof useBudget.getState>['replaceDocument']>[0]): void;
}): JSX.Element {
  const doc = useBudget((s) => s.doc)!;
  const [message, setMessage] = useState<string | null>(null);

  const exportFile = async (): Promise<void> => {
    const repo = currentRepository();
    if (!repo) return;
    const text = await repo.exportText(doc);
    setMessage(await exportDocument(repo.exportFileName(), text));
  };

  const importFile = async (file: File): Promise<void> => {
    const repo = currentRepository();
    if (!repo) return;
    const result = await repo.importText(await file.text());
    if (result.status === 'OK') {
      onImported(result.doc);
      setMessage('Документ заменён. Копия прежнего состояния сохранена в снимках.');
    } else {
      setMessage(result.message);
    }
  };

  return (
    <Sheet open={open} title="Экспорт и импорт" onClose={onClose}>
      <button className="link" onClick={() => void exportFile()}>
        Выгрузить файл <span>JSON с отступами</span>
      </button>

      <div className="field">
        <label htmlFor="simport">Загрузить файл</label>
        <input
          id="simport"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </div>

      <p className="hint">
        Импорт заменяет документ целиком и не сливает две истории. Перед заменой автоматически
        снимается копия текущего состояния.
      </p>
      {message && <p className="hint">{message}</p>}
    </Sheet>
  );
}

/** Восстановление заменяет текущий документ и потому требует подтверждения (4.4). */
function BackupsSheet({
  open,
  onClose,
  onRestored,
}: {
  open: boolean;
  onClose(): void;
  onRestored(doc: Parameters<ReturnType<typeof useBudget.getState>['replaceDocument']>[0]): void;
}): JSX.Element {
  const [list, setList] = useState<BackupInfo[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void currentRepository()?.listBackups().then(setList);
    setConfirm(null);
    setMessage(null);
  }, [open]);

  const restore = async (path: string): Promise<void> => {
    const result = await currentRepository()?.restoreBackup(path);
    if (result?.status === 'OK') {
      onRestored(result.doc);
      setMessage('Документ восстановлен из снимка.');
    } else {
      setMessage(result && 'message' in result ? result.message : 'Снимок не читается');
    }
    setConfirm(null);
  };

  return (
    <Sheet open={open} title="Снимки" onClose={onClose}>
      {list.length === 0 && <p className="hint">Снимков пока нет. Первый появится при следующей записи.</p>}
      {list.map((backup) => (
        <div key={backup.name}>
          <div className="sub-i">
            <span className="sub-n">
              {backup.preMigration ? 'Перед миграцией' : backup.name.replace('.json', '')}
              <span className="sub-d">{Math.round(backup.size / 1024)} КБ</span>
            </span>
            <button className="sub-more" style={{ width: 'auto' }} onClick={() => setConfirm(backup.path)}>
              Восстановить
            </button>
          </div>
          {confirm === backup.path && (
            <>
              <p className="hint">
                Текущий документ будет заменён содержимым снимка. Это необратимо.
              </p>
              <button className="save" style={{ background: 'var(--alarm)' }} onClick={() => void restore(backup.path)}>
                Заменить документ
              </button>
            </>
          )}
        </div>
      ))}
      {message && <p className="hint">{message}</p>}
      <p className="hint">Хранятся семь последних суточных снимков. Копия перед миграцией не удаляется.</p>
      <p className="hint">{daysWord(7)} истории — этого хватает на «вчера что-то сломал, хочу как было».</p>
    </Sheet>
  );
}
