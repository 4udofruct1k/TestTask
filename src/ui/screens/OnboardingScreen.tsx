/**
 * Первый запуск. Раздел 3.11: три шага, каждый пропускается.
 * Пропустивший всё получает рабочее приложение.
 */

import { useState, type JSX } from 'react';
import { monthKeyOf } from '../../domain/dates';
import { formatRub, parseAmount } from '../../domain/money';
import { useBudget } from '../../store/budget';

/** Пресеты постоянных платежей — считать самому не нужно. */
const PRESETS = ['Аренда', 'Связь', 'Интернет', 'Подписки', 'Спортзал'];

interface Props {
  /** Онбординг вызван из настроек, документ уже есть */
  repeat?: boolean;
  onDone(): void;
}

export function OnboardingScreen({ repeat, onDone }: Props): JSX.Element {
  const startFresh = useBudget((s) => s.startFresh);
  const addFixedMonthly = useBudget((s) => s.addFixedMonthly);
  const setMonthlyTarget = useBudget((s) => s.setMonthlyTarget);
  const today = useBudget((s) => s.today);
  const docFromStore = useBudget((s) => s.doc);

  const [step, setStep] = useState(0);
  const [salary, setSalary] = useState('');
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const [target, setTarget] = useState('');

  const month = monthKeyOf(today);

  const ensureDocument = (): void => {
    if (!docFromStore) startFresh();
  };

  const categoryId = (name: string): string => {
    const doc = useBudget.getState().doc;
    return doc?.categories.find((c) => c.name === name && !c.archived)?.id ?? doc?.categories[0]?.id ?? '';
  };

  const finishSalary = (): void => {
    ensureDocument();
    const amount = parseAmount(salary);
    if (amount !== null && amount > 0) {
      addFixedMonthly({
        title: 'Зарплата',
        kind: 'INCOME',
        categoryId: categoryId('Зарплата'),
        amount,
        fromMonth: month,
      });
    }
    setStep(1);
  };

  const finishFixed = (): void => {
    ensureDocument();
    for (const [title, raw] of Object.entries(fixed)) {
      const amount = parseAmount(raw);
      if (amount === null || amount <= 0) continue;
      addFixedMonthly({
        title,
        kind: 'EXPENSE',
        categoryId: categoryId(title === 'Подписки' ? 'Подписки' : title === 'Связь' || title === 'Интернет' ? 'Связь' : 'Жильё'),
        amount,
        fromMonth: month,
      });
    }
    setStep(2);
  };

  const finishTarget = (): void => {
    ensureDocument();
    const amount = parseAmount(target);
    // Ноль сохраняется как цель: это сказанное вслух «не откладываю», а не пропуск
    if (amount !== null && amount >= 0) setMonthlyTarget(month, amount);
    onDone();
  };

  const skip = (next: number | null): void => {
    ensureDocument();
    if (next === null) onDone();
    else setStep(next);
  };

  return (
    <section className="pane">
      <div className="bar">
        <div className="bar-title">{repeat ? 'Заполнить заново' : 'Настроим за минуту'}</div>
        <div className="bar-sub">Шаг {step + 1} из 3</div>
      </div>

      <div className="scroll">
        <div className="body">
          {step === 0 && (
            <div className="card">
              <div className="card-h">
                <div className="card-t">Зарплата</div>
              </div>
              <p className="card-p">
                Постоянный доход месяца. Дат внутри месяца у него нет: единица учёта — месяц.
              </p>
              <div className="field">
                <label htmlFor="osalary">Сколько приходит в месяц</label>
                <input id="osalary" inputMode="decimal" value={salary} placeholder="0" onChange={(e) => setSalary(e.target.value)} />
              </div>
              <button className="save" onClick={finishSalary}>
                Дальше
              </button>
              <button className="sub-more" onClick={() => skip(1)}>
                Пропустить
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="card">
              <div className="card-h">
                <div className="card-t">Постоянные платежи</div>
              </div>
              <p className="card-p">Заполните то, что платите каждый месяц. Пустые строки не сохранятся.</p>
              {PRESETS.map((preset) => (
                <div className="field" key={preset}>
                  <label htmlFor={`o-${preset}`}>{preset}</label>
                  <input
                    id={`o-${preset}`}
                    inputMode="decimal"
                    value={fixed[preset] ?? ''}
                    placeholder="0"
                    onChange={(e) => setFixed({ ...fixed, [preset]: e.target.value })}
                  />
                </div>
              ))}
              <button className="save" onClick={finishFixed}>
                Дальше
              </button>
              <button className="sub-more" onClick={() => skip(2)}>
                Пропустить
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="card">
              <div className="card-h">
                <div className="card-t">Цель по накоплению</div>
              </div>
              <p className="card-p">
                Сколько хочется откладывать каждый месяц. Из неё считается потолок трат и дневной
                остаток. Это ориентир, а не денежная операция: в накопление она не входит.
                Можно пропустить или поставить ноль — тогда потолка трат не будет.
              </p>
              <div className="field">
                <label htmlFor="otarget">Сумма в месяц</label>
                <input id="otarget" inputMode="decimal" value={target} placeholder="0" onChange={(e) => setTarget(e.target.value)} />
              </div>
              {parseAmount(target) !== null && parseAmount(target)! > 0 && (
                <p className="hint">Цель {formatRub(parseAmount(target)!)} в месяц, начиная с текущего.</p>
              )}
              <button className="save" onClick={finishTarget}>
                Готово
              </button>
              <button className="sub-more" onClick={() => skip(null)}>
                Пропустить
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
