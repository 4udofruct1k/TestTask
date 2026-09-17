/** Имена файлов в приватной директории приложения (4.1). */

export const DATA_FILE = 'budget.json';
export const TMP_FILE = 'budget.tmp';
export const BACKUP_DIR = 'backups';

/** Суточный снимок. Участвует в ротации семи. */
export const dailyBackupPath = (day: string): string => `${BACKUP_DIR}/${day}.json`;

/** Снимок перед цепочкой миграций. В ротацию не входит и не удаляется автоматически. */
export const preMigrationPath = (version: number): string => `${BACKUP_DIR}/pre-migration-v${version}.json`;

const DAILY_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

export const isDailyBackup = (name: string): boolean => DAILY_RE.test(name);
export const isPreMigrationBackup = (name: string): boolean => name.startsWith('pre-migration-v');
