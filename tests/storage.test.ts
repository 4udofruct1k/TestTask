/**
 * Приёмка хранилища — тестовые кейсы 4.10, К1 по К6.
 *
 * Обрыв записи воспроизводится подменой файлового слоя, а не убийством
 * процесса: файловый доступ за интерфейсом именно ради этого.
 */

import { describe, expect, it } from 'vitest';
import {
  BudgetRepository,
  MemoryFiles,
  atomicWrite,
  dailyBackup,
  listBackups,
  migrate,
  preMigrationBackup,
  serialize,
  wrap,
  type Clock,
} from '../src/storage';
import { BACKUP_DIR, DATA_FILE, TMP_FILE, preMigrationPath } from '../src/storage/paths';
import { monthSummary } from '../src/engine';
import { validateDocument } from '../src/domain/validate';
import type { BudgetDocument } from '../src/domain/types';
import { emptyDoc, expense, monthly, R } from './fixtures';

const APP_VERSION = '1.0.0';

/** Часы приходят снаружи — мокать глобальное время не требуется. */
class FixedClock implements Clock {
  constructor(private iso: string) {}
  nowIso(): string {
    return this.iso;
  }
  set(iso: string): void {
    this.iso = iso;
  }
}

/** Файловый слой, обрывающий запись во временный файл на середине. */
class HalfWriteFiles extends MemoryFiles {
  override async write(path: string, data: string): Promise<void> {
    await super.write(path, path === TMP_FILE ? data.slice(0, Math.floor(data.length / 2)) : data);
  }
}

function makeRepo(files: MemoryFiles, clock: Clock) {
  return new BudgetRepository({ files, clock, appVersion: APP_VERSION, debounceMs: 0 });
}

function seed(files: MemoryFiles, doc: BudgetDocument, savedAt = '2026-03-15T10:00:00Z') {
  return files.write(DATA_FILE, serialize(wrap(doc, savedAt, APP_VERSION)));
}

function docWithSalary(): BudgetDocument {
  const doc = emptyDoc();
  doc.fixedItems = [
    monthly('Зарплата', 'INCOME', 'c-salary', [{ fromMonth: '2026-01', amount: R(120000) }]),
  ];
  return doc;
}

describe('К1. Обрыв на записи', () => {
  it('обрезанная запись не подтверждается, budget.json остаётся нетронутым', async () => {
    const files = new HalfWriteFiles();
    const before = serialize(wrap(docWithSalary(), '2026-03-15T10:00:00Z', APP_VERSION));
    await files.write(DATA_FILE, before);

    const result = await atomicWrite(files, serialize(wrap(emptyDoc(), '2026-03-16T10:00:00Z', APP_VERSION)));

    expect(result.ok).toBe(false);
    expect(files.peek(DATA_FILE)).toBe(before);
    // Промежуточного состояния не остаётся: tmp удалён
    expect(files.has(TMP_FILE)).toBe(false);
  });

  it('при следующем запуске budget.json цел, budget.tmp удаляется как мусор', async () => {
    const files = new MemoryFiles();
    await seed(files, docWithSalary());
    await files.write(TMP_FILE, '{"format":"budget-app","doc":{"schemaV');

    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.load();

    expect(result.status).toBe('OK');
    expect(files.has(TMP_FILE)).toBe(false);
    if (result.status === 'OK') expect(result.doc.fixedItems).toHaveLength(1);
  });

  it('флаг несохранённых изменений не снимается, пока запись не подтвердилась', async () => {
    const files = new HalfWriteFiles();
    await seed(files, docWithSalary());
    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));

    repo.scheduleSave(emptyDoc());
    const result = await repo.flush();

    expect(result.ok).toBe(false);
    expect(repo.hasUnsavedChanges).toBe(true);
    repo.dispose();
  });
});

describe('К2. Файл из будущего', () => {
  it('schemaVersion 4 при поддержке 3 → отказ, документ на диске не изменён', async () => {
    const files = new MemoryFiles();
    const future = { ...emptyDoc(), schemaVersion: 4 };
    const text = serialize(wrap(future as BudgetDocument, '2026-03-16T10:00:00Z', APP_VERSION));
    await files.write(DATA_FILE, text);

    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.load();

    expect(result.status).toBe('FROM_FUTURE');
    if (result.status === 'FROM_FUTURE') {
      expect(result.fileVersion).toBe(4);
      expect(result.supported).toBe(3);
    }
    expect(files.peek(DATA_FILE)).toBe(text);
    repo.dispose();
  });

  it('из будущего не восстанавливается из бэкапа: это не порча, а старая сборка', async () => {
    const files = new MemoryFiles();
    await files.write(`${BACKUP_DIR}/2026-03-10.json`, serialize(wrap(docWithSalary(), '2026-03-10T10:00:00Z', APP_VERSION)));
    await files.write(
      DATA_FILE,
      serialize(wrap({ ...emptyDoc(), schemaVersion: 9 } as BudgetDocument, '2026-03-16T10:00:00Z', APP_VERSION)),
    );

    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    expect((await repo.load()).status).toBe('FROM_FUTURE');
    repo.dispose();
  });
});

describe('К3. Миграция 2→3', () => {
  /** Документ версии 2: у категорий нет defaultFlow, у позиций нет mode, целей нет. */
  function v2Document() {
    return {
      schemaVersion: 2,
      categories: [
        { id: 'c-food', name: 'Продукты', kind: 'EXPENSE', essential: true, icon: '🛒', color: '#22C46E', archived: false, sortOrder: 0 },
        { id: 'c-tech', name: 'Техника', kind: 'EXPENSE', essential: false, defaultFlow: 'ONE_OFF', icon: '🎧', color: '#0E1511', archived: false, sortOrder: 1 },
        { id: 'c-home', name: 'Жильё', kind: 'EXPENSE', essential: true, icon: '🏠', color: '#06834A', archived: false, sortOrder: 2 },
        { id: 'c-salary', name: 'Зарплата', kind: 'INCOME', essential: false, icon: '💰', color: '#22C46E', archived: false, sortOrder: 3 },
      ],
      expenses: [
        { id: 'e1', date: '2026-03-05', amount: R(1000), categoryId: 'c-food', createdAt: '2026-03-05T10:00:00Z' },
        { id: 'e2', date: '2026-03-06', amount: R(24000), categoryId: 'c-tech', createdAt: '2026-03-06T10:00:00Z' },
      ],
      fixedItems: [
        { id: 'f1', title: 'Зарплата', kind: 'INCOME', categoryId: 'c-salary', amounts: [{ fromMonth: '2026-01', amount: R(120000) }] },
        { id: 'f2', title: 'Аренда', kind: 'EXPENSE', categoryId: 'c-home', amounts: [{ fromMonth: '2026-01', amount: R(35000) }] },
      ],
      overrides: [],
      settings: { firstMonth: '2026-01', startingBalance: 0, createdAt: '2026-01-01T00:00:00Z' },
    };
  }

  it('категория без defaultFlow получает ROUTINE', () => {
    const result = migrate(v2Document());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const categories = result.doc['categories'] as Record<string, unknown>[];
    expect(categories[0]!['defaultFlow']).toBe('ROUTINE');
    expect(categories[1]!['defaultFlow']).toBe('ONE_OFF');
  });

  it('у всех операций проставляется flow из defaultFlow категории', () => {
    const result = migrate(v2Document());
    if (!result.ok) throw new Error('миграция не прошла');
    const expenses = result.doc['expenses'] as Record<string, unknown>[];
    expect(expenses[0]!['flow']).toBe('ROUTINE');
    expect(expenses[1]!['flow']).toBe('ONE_OFF');
  });

  it('позиции получают mode MONTHLY, появляются цели и месячная цель', () => {
    const result = migrate(v2Document());
    if (!result.ok) throw new Error('миграция не прошла');
    const items = result.doc['fixedItems'] as Record<string, unknown>[];
    expect(items.every((i) => i['mode'] === 'MONTHLY')).toBe(true);
    expect(result.doc['goals']).toEqual([]);
    expect((result.doc['settings'] as Record<string, unknown>)['targets']).toEqual([]);
    expect(result.doc['schemaVersion']).toBe(3);
    expect(result.applied).toEqual([3]);
  });

  it('суммы месяцев до и после миграции совпадают', () => {
    const before = v2Document();
    const rawVariable = before.expenses.reduce((s, e) => s + e.amount, 0);
    const rawFixedExpense = before.fixedItems
      .filter((f) => f.kind === 'EXPENSE')
      .reduce((s, f) => s + f.amounts[0]!.amount, 0);
    const rawFixedIncome = before.fixedItems
      .filter((f) => f.kind === 'INCOME')
      .reduce((s, f) => s + f.amounts[0]!.amount, 0);

    const result = migrate(before);
    if (!result.ok) throw new Error('миграция не прошла');
    const validated = validateDocument(result.doc);
    expect(validated.fatal).toEqual([]);

    const summary = monthSummary(validated.doc!, '2026-03', '2026-03-16');
    expect(summary.variableExpense).toBe(rawVariable);
    expect(summary.fixedExpense).toBe(rawFixedExpense);
    expect(summary.fixedIncome).toBe(rawFixedIncome);
    expect(summary.routineExpense).toBe(R(1000));
    expect(summary.oneOffExpense).toBe(R(24000));
  });

  it('цепочка 1→2→3 существует и проходит целиком', () => {
    const v1 = {
      schemaVersion: 1,
      categories: v2Document().categories,
      expenses: [
        { id: 'e1', date: '2026-03-05', amount: R(1000), categoryId: 'c-food', createdAt: '2026-03-05T10:00:00Z', planned: true, confirmed: false },
      ],
      recurring: [
        { id: 'f1', title: 'Аренда', kind: 'EXPENSE', categoryId: 'c-home', amount: R(35000), dayOfMonth: 5, startMonth: '2026-01' },
      ],
      settings: { firstMonth: '2026-01', startingBalance: 0, createdAt: '2026-01-01T00:00:00Z' },
    };

    const result = migrate(v1);
    if (!result.ok) throw new Error('миграция не прошла');
    expect(result.applied).toEqual([2, 3]);

    const items = result.doc['fixedItems'] as Record<string, unknown>[];
    // Дата внутри месяца и подтверждение уходят вместе с первой моделью
    expect(items[0]!['dayOfMonth']).toBeUndefined();
    expect((result.doc['expenses'] as Record<string, unknown>[])[0]!['confirmed']).toBeUndefined();

    const validated = validateDocument(result.doc);
    expect(validated.fatal).toEqual([]);
    expect(monthSummary(validated.doc!, '2026-03', '2026-03-16').fixedExpense).toBe(R(35000));
  });

  it('перед цепочкой снимается pre-migration и в ротацию не входит', async () => {
    const files = new MemoryFiles();
    await files.write(DATA_FILE, serialize(wrap(v2Document() as unknown as BudgetDocument, '2026-03-15T10:00:00Z', APP_VERSION)));

    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.load();

    expect(result.status).toBe('OK');
    expect(files.has(preMigrationPath(2))).toBe(true);
    repo.dispose();
  });
});

describe('К4. Посторонний JSON', () => {
  it('файл без format отвергается на второй проверке, до разбора содержимого', async () => {
    const files = new MemoryFiles();
    await files.write(DATA_FILE, JSON.stringify({ hello: 'world', doc: { schemaVersion: 3 } }));

    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.load();

    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') {
      expect(result.message).toContain('budget-app');
      // До инвариантов дело не дошло
      expect(result.fatal).toEqual([]);
    }
    repo.dispose();
  });

  it('сломанный JSON отвергается на первой проверке', async () => {
    const files = new MemoryFiles();
    await files.write(DATA_FILE, '{"format":"budget-app",');
    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.load();
    expect(result.status).toBe('FAILED');
    if (result.status === 'FAILED') expect(result.message).toContain('JSON');
    repo.dispose();
  });

  it('импорт отвергает посторонний файл теми же проверками', async () => {
    const files = new MemoryFiles();
    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.importText(JSON.stringify({ format: 'something-else', doc: {} }));
    expect(result.status).toBe('REJECTED');
    repo.dispose();
  });

  it('импорт заменяет документ целиком и снимает бэкап текущего', async () => {
    const files = new MemoryFiles();
    await seed(files, docWithSalary());
    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));

    const incoming = emptyDoc();
    incoming.expenses = [expense('2026-03-02', R(500), 'c-food')];
    const result = await repo.importText(serialize(wrap(incoming, '2026-03-16T09:00:00Z', APP_VERSION)));

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.doc.expenses).toHaveLength(1);
      // Слияния нет: позиции прежнего документа не сохранились
      expect(result.doc.fixedItems).toHaveLength(0);
    }
    expect(files.has(`${BACKUP_DIR}/2026-03-16.json`)).toBe(true);
    repo.dispose();
  });
});

describe('К5. Битая ссылка', () => {
  it('операция на удалённую категорию переносится в «Прочее», загрузка продолжается', async () => {
    const files = new MemoryFiles();
    const doc = emptyDoc();
    doc.expenses = [expense('2026-03-05', R(1240), 'c-исчезла')];
    await seed(files, doc);

    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.load();

    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.journal.map((f) => f.code)).toContain('ORPHAN_CATEGORY_REF');
    const moved = result.doc.expenses[0]!;
    expect(result.doc.categories.find((c) => c.id === moved.categoryId)!.name).toBe('Прочее');
    expect(moved.amount).toBe(R(1240));
    repo.dispose();
  });

  it('нечинимая порча ведёт к восстановлению из бэкапа', async () => {
    const files = new MemoryFiles();
    const good = docWithSalary();
    await files.write(`${BACKUP_DIR}/2026-03-14.json`, serialize(wrap(good, '2026-03-14T10:00:00Z', APP_VERSION)));

    const broken = emptyDoc();
    broken.expenses = [expense('2026-03-05', -500, 'c-food')];
    await seed(files, broken);

    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.load();

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.restoredFrom).toBe('2026-03-14.json');
      expect(result.doc.fixedItems).toHaveLength(1);
    }
    repo.dispose();
  });
});

describe('К6. Ротация', () => {
  it('семь снимков, наступил восьмой день → удаляется самый старый', async () => {
    const files = new MemoryFiles();
    await seed(files, docWithSalary());
    await preMigrationBackup(files, 2);

    for (let day = 1; day <= 8; day++) {
      await dailyBackup(files, `2026-03-${String(day).padStart(2, '0')}`);
      await files.write(DATA_FILE, serialize(wrap(docWithSalary(), `2026-03-${String(day).padStart(2, '0')}T10:00:00Z`, APP_VERSION)));
    }

    const names = (await listBackups(files)).map((b) => b.name);
    const daily = names.filter((n) => !n.startsWith('pre-migration'));

    expect(daily).toHaveLength(7);
    expect(daily).not.toContain('2026-03-01.json');
    expect(daily).toContain('2026-03-08.json');
    // pre-migration остаётся
    expect(names).toContain('pre-migration-v2.json');
  });

  it('снимок не чаще раза в сутки', async () => {
    const files = new MemoryFiles();
    await seed(files, docWithSalary());

    expect(await dailyBackup(files, '2026-03-16')).toBe(true);
    expect(await dailyBackup(files, '2026-03-16')).toBe(false);
    expect((await listBackups(files)).filter((b) => !b.preMigration)).toHaveLength(1);
  });
});

describe('запись и жизненный цикл', () => {
  it('первый запуск: файла нет', async () => {
    const repo = makeRepo(new MemoryFiles(), new FixedClock('2026-03-16T10:00:00Z'));
    expect((await repo.load()).status).toBe('EMPTY');
    repo.dispose();
  });

  it('дебаунс: записывается один раз после последнего изменения', async () => {
    const files = new MemoryFiles();
    const clock = new FixedClock('2026-03-16T10:00:00Z');
    const repo = new BudgetRepository({ files, clock, appVersion: APP_VERSION, debounceMs: 20 });

    repo.scheduleSave(emptyDoc());
    repo.scheduleSave(docWithSalary());
    expect(repo.hasUnsavedChanges).toBe(true);
    expect(files.has(DATA_FILE)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(repo.hasUnsavedChanges).toBe(false);
    const saved = JSON.parse(files.peek(DATA_FILE)!) as { doc: { fixedItems: unknown[] } };
    expect(saved.doc.fixedItems).toHaveLength(1);
    repo.dispose();
  });

  it('событие pause пишет принудительно, не дожидаясь дебаунса', async () => {
    const files = new MemoryFiles();
    let pause: (() => void) | null = null;
    const repo = new BudgetRepository({
      files,
      clock: new FixedClock('2026-03-16T10:00:00Z'),
      appVersion: APP_VERSION,
      debounceMs: 10_000,
      lifecycle: {
        onPause: (handler) => {
          pause = handler;
          return () => undefined;
        },
      },
    });

    repo.scheduleSave(docWithSalary());
    pause!();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(files.has(DATA_FILE)).toBe(true);
    expect(repo.hasUnsavedChanges).toBe(false);
    repo.dispose();
  });

  it('конверт несёт метаданные, schemaVersion живёт внутри doc и не дублируется', async () => {
    const files = new MemoryFiles();
    const repo = makeRepo(files, new FixedClock('2026-03-16T18:42:11Z'));
    repo.scheduleSave(docWithSalary());
    await repo.flush();

    const envelope = JSON.parse(files.peek(DATA_FILE)!) as Record<string, unknown>;
    expect(envelope['format']).toBe('budget-app');
    expect(envelope['savedAt']).toBe('2026-03-16T18:42:11Z');
    expect(envelope['appVersion']).toBe(APP_VERSION);
    expect(envelope['schemaVersion']).toBeUndefined();
    expect((envelope['doc'] as Record<string, unknown>)['schemaVersion']).toBe(3);
    repo.dispose();
  });

  it('экспорт с отступами, имя с датой', async () => {
    const repo = makeRepo(new MemoryFiles(), new FixedClock('2026-03-16T18:42:11Z'));
    const text = await repo.exportText(docWithSalary());
    expect(text).toContain('\n  ');
    expect(repo.exportFileName()).toBe('budget-2026-03-16.json');
    repo.dispose();
  });

  it('восстановление из снимка заменяет текущий документ', async () => {
    const files = new MemoryFiles();
    await seed(files, emptyDoc());
    await files.write(`${BACKUP_DIR}/2026-03-10.json`, serialize(wrap(docWithSalary(), '2026-03-10T10:00:00Z', APP_VERSION)));

    const repo = makeRepo(files, new FixedClock('2026-03-16T10:00:00Z'));
    const result = await repo.restoreBackup(`${BACKUP_DIR}/2026-03-10.json`);

    expect(result.status).toBe('OK');
    if (result.status === 'OK') expect(result.doc.fixedItems).toHaveLength(1);
    const onDisk = JSON.parse(files.peek(DATA_FILE)!) as { doc: { fixedItems: unknown[] } };
    expect(onDisk.doc.fixedItems).toHaveLength(1);
    repo.dispose();
  });
});
