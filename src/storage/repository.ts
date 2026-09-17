/**
 * Хранилище документа. Часть 4.
 *
 * Собирает вместе конверт, атомарную запись, бэкапы, миграции и валидацию.
 * Часы приходят снаружи (Clock), файловый слой — интерфейсом: и то и другое
 * подменяется в тестах, поэтому мокать глобальное время не нужно.
 */

import { validateDocument, type Fatal, type Fix } from '../domain/validate';
import { CURRENT_SCHEMA_VERSION, type BudgetDocument } from '../domain/types';
import { atomicWrite, dropStaleTmp, type WriteResult } from './atomic';
import { dailyBackup, listBackups, preMigrationBackup, type BackupInfo } from './backups';
import { parseEnvelope, serialize, serializePretty, wrap } from './envelope';
import type { FileAccess } from './files';
import { migrate } from './migrations';
import { DATA_FILE } from './paths';

/** Дебаунс записи из 4.3. */
export const SAVE_DEBOUNCE_MS = 800;

export interface Clock {
  /** ISO 8601 UTC, например "2026-03-16T18:42:11Z" */
  nowIso(): string;
}

export interface Lifecycle {
  /** Подписка на уход приложения в фон. Возвращает отписку. */
  onPause(handler: () => void): () => void;
}

export interface RepositoryOptions {
  files: FileAccess;
  clock: Clock;
  appVersion: string;
  debounceMs?: number;
  lifecycle?: Lifecycle;
  supportedSchemaVersion?: number;
}

export type LoadResult =
  | { status: 'OK'; doc: BudgetDocument; journal: Fix[]; restoredFrom: string | null; migrated: number[] }
  /** Файла нет — первый запуск */
  | { status: 'EMPTY' }
  /** Файл новее сборки. Документ не трогается, показывается сообщение (4.6) */
  | { status: 'FROM_FUTURE'; fileVersion: number; supported: number; message: string }
  | { status: 'FAILED'; fatal: Fatal[]; message: string };

export type ImportResult =
  | { status: 'OK'; doc: BudgetDocument; journal: Fix[] }
  | { status: 'REJECTED'; message: string; fatal?: Fatal[] };

export class BudgetRepository {
  private readonly files: FileAccess;
  private readonly clock: Clock;
  private readonly appVersion: string;
  private readonly debounceMs: number;
  private readonly supported: number;
  private readonly unsubscribePause: (() => void) | null;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: BudgetDocument | null = null;
  private lastBackupDay: string | null = null;

  constructor(options: RepositoryOptions) {
    this.files = options.files;
    this.clock = options.clock;
    this.appVersion = options.appVersion;
    this.debounceMs = options.debounceMs ?? SAVE_DEBOUNCE_MS;
    this.supported = options.supportedSchemaVersion ?? CURRENT_SCHEMA_VERSION;
    // Принудительная запись, когда приложение уходит в фон
    this.unsubscribePause = options.lifecycle?.onPause(() => void this.flush()) ?? null;
  }

  /** Есть ли несохранённые изменения — флаг живёт в памяти (4.3). */
  get hasUnsavedChanges(): boolean {
    return this.pending !== null;
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.unsubscribePause?.();
  }

  async load(): Promise<LoadResult> {
    // Недописанный tmp с прошлого запуска — мусор (4.10, К1)
    await dropStaleTmp(this.files);

    const raw = await this.files.read(DATA_FILE);
    if (raw === null) return { status: 'EMPTY' };

    const direct = await this.openText(raw, true);
    if (direct.status === 'OK' || direct.status === 'FROM_FUTURE') return direct;

    // Нечинимое ведёт к восстановлению из бэкапа (4.7)
    const restored = await this.restoreFromBackups();
    return restored ?? direct;
  }

  /** Разбор и проверка текста файла. atBackup — снимать ли pre-migration копию. */
  private async openText(text: string, allowPreMigrationBackup: boolean): Promise<LoadResult> {
    const parsed = parseEnvelope(text);
    if (!parsed.ok) return { status: 'FAILED', fatal: [], message: parsed.message };

    const migrated = migrate(parsed.envelope.doc, this.supported);
    if (!migrated.ok) {
      if (migrated.reason === 'FROM_FUTURE') {
        return {
          status: 'FROM_FUTURE',
          fileVersion: migrated.fileVersion,
          supported: this.supported,
          message: migrated.message,
        };
      }
      return { status: 'FAILED', fatal: [], message: migrated.message };
    }

    if (migrated.applied.length > 0 && allowPreMigrationBackup) {
      const fileVersion = migrated.applied[0]! - 1;
      await preMigrationBackup(this.files, fileVersion);
    }

    const result = validateDocument(migrated.doc, this.supported);
    if (result.doc === null) {
      return {
        status: 'FAILED',
        fatal: result.fatal,
        message: result.fatal[0]?.message ?? 'Документ не прошёл проверку инвариантов',
      };
    }

    return {
      status: 'OK',
      doc: result.doc,
      journal: result.fixed,
      restoredFrom: null,
      migrated: migrated.applied,
    };
  }

  private async restoreFromBackups(): Promise<LoadResult | null> {
    for (const backup of await listBackups(this.files)) {
      const text = await this.files.read(backup.path);
      if (text === null) continue;
      const result = await this.openText(text, false);
      if (result.status === 'OK') return { ...result, restoredFrom: backup.name };
    }
    return null;
  }

  /** Отложенная запись: дебаунс после последнего изменения. */
  scheduleSave(doc: BudgetDocument): void {
    this.pending = doc;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /** Немедленная запись: pause, экспорт, выход. */
  async flush(): Promise<WriteResult> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const doc = this.pending;
    if (doc === null) return { ok: true };

    const now = this.clock.nowIso();
    const day = now.slice(0, 10);
    if (this.lastBackupDay !== day) {
      await dailyBackup(this.files, day);
      this.lastBackupDay = day;
    }

    const result = await atomicWrite(this.files, serialize(wrap(doc, now, this.appVersion)));
    // Флаг снимается только при успехе: иначе изменения потеряются молча
    if (result.ok) this.pending = null;
    return result;
  }

  /** Экспортный файл с отступами. Перед выгрузкой — принудительная запись. */
  async exportText(doc: BudgetDocument): Promise<string> {
    await this.flush();
    return serializePretty(wrap(doc, this.clock.nowIso(), this.appVersion));
  }

  exportFileName(): string {
    return `budget-${this.clock.nowIso().slice(0, 10)}.json`;
  }

  /**
   * Импорт заменяет документ целиком и не сливает.
   * Перед заменой автоматически снимается бэкап текущего состояния.
   */
  async importText(text: string): Promise<ImportResult> {
    const parsed = parseEnvelope(text);
    if (!parsed.ok) return { status: 'REJECTED', message: parsed.message };

    const migrated = migrate(parsed.envelope.doc, this.supported);
    if (!migrated.ok) return { status: 'REJECTED', message: migrated.message };

    const result = validateDocument(migrated.doc, this.supported);
    if (result.doc === null) {
      return {
        status: 'REJECTED',
        message: result.fatal[0]?.message ?? 'Файл не прошёл проверку инвариантов',
        fatal: result.fatal,
      };
    }

    await dailyBackup(this.files, this.clock.nowIso().slice(0, 10));
    return { status: 'OK', doc: result.doc, journal: result.fixed };
  }

  listBackups(): Promise<BackupInfo[]> {
    return listBackups(this.files);
  }

  /** Восстановление заменяет текущий документ — необратимо, требует подтверждения (4.4). */
  async restoreBackup(path: string): Promise<LoadResult> {
    const text = await this.files.read(path);
    if (text === null) return { status: 'FAILED', fatal: [], message: 'Снимок не найден' };
    const result = await this.openText(text, false);
    if (result.status === 'OK') {
      this.pending = result.doc;
      await this.flush();
    }
    return result;
  }
}

/** Системные часы. Единственное место, где хранилище смотрит на время. */
export const systemClock: Clock = {
  nowIso: () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
};
