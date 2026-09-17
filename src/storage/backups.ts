/**
 * Бэкапы. Раздел 4.4.
 *
 * Снимок суточный, а не на каждую запись: две сотни операций за день дали бы
 * две сотни копий почти одинакового состояния.
 */

import type { FileAccess } from './files';
import {
  BACKUP_DIR,
  DATA_FILE,
  dailyBackupPath,
  isDailyBackup,
  isPreMigrationBackup,
  preMigrationPath,
} from './paths';

export const KEEP_BACKUPS = 7;

export interface BackupInfo {
  name: string;
  path: string;
  /** Размер в символах — столько показывает список восстановления */
  size: number;
  preMigration: boolean;
}

/**
 * Снимок перед записью, но не чаще раза в сутки.
 * Возвращает true, если снимок сделан.
 */
export async function dailyBackup(files: FileAccess, day: string): Promise<boolean> {
  const current = await files.read(DATA_FILE);
  if (current === null) return false;

  const path = dailyBackupPath(day);
  if ((await files.read(path)) !== null) return false;

  await files.mkdir(BACKUP_DIR);
  await files.write(path, current);
  await rotate(files);
  return true;
}

/** Снимок перед цепочкой миграций. Не входит в ротацию семи (4.6). */
export async function preMigrationBackup(files: FileAccess, version: number): Promise<void> {
  const current = await files.read(DATA_FILE);
  if (current === null) return;
  await files.mkdir(BACKUP_DIR);
  await files.write(preMigrationPath(version), current);
}

/** Хранятся семь последних суточных, старые удаляются. */
export async function rotate(files: FileAccess): Promise<string[]> {
  const names = await files.list(BACKUP_DIR);
  const daily = names.filter(isDailyBackup).sort();
  const extra = daily.slice(0, Math.max(0, daily.length - KEEP_BACKUPS));
  for (const name of extra) await files.remove(`${BACKUP_DIR}/${name}`);
  return extra;
}

/** Список снимков для экрана восстановления: новые сверху. */
export async function listBackups(files: FileAccess): Promise<BackupInfo[]> {
  const names = await files.list(BACKUP_DIR);
  const out: BackupInfo[] = [];
  for (const name of names) {
    if (!isDailyBackup(name) && !isPreMigrationBackup(name)) continue;
    const path = `${BACKUP_DIR}/${name}`;
    const content = await files.read(path);
    if (content === null) continue;
    out.push({ name, path, size: content.length, preMigration: isPreMigrationBackup(name) });
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}
