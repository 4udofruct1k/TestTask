/**
 * Атомарная запись. Раздел 4.3.
 *
 * Filesystem.writeFile не атомарен. Обрыв на середине оставит обрезанный
 * файл, а это вся история целиком. Поэтому пишем во временный, сверяем
 * и переименовываем: промежуточного состояния, в котором испорчен
 * основной файл, не существует ни на одном шаге.
 */

import type { FileAccess } from './files';
import { DATA_FILE, TMP_FILE } from './paths';

export type WriteResult = { ok: true } | { ok: false; message: string };

/** Пара «основной файл и его временный». По умолчанию — документ бюджета. */
export interface AtomicTarget {
  file: string;
  tmp: string;
}

const BUDGET_TARGET: AtomicTarget = { file: DATA_FILE, tmp: TMP_FILE };

export async function atomicWrite(
  files: FileAccess,
  data: string,
  { file, tmp }: AtomicTarget = BUDGET_TARGET,
): Promise<WriteResult> {
  try {
    // 2. записать во временный
    await files.write(tmp, data);

    // 3. прочитать обратно и сверить длину — файл маленький, проверка дешёвая
    const readBack = await files.read(tmp);
    if (readBack === null || readBack.length !== data.length) {
      await files.remove(tmp).catch(() => undefined);
      return {
        ok: false,
        message: `Запись не подтвердилась: ожидалось ${data.length} символов, прочитано ${readBack?.length ?? 0}`,
      };
    }

    // 4. переименование в пределах одной файловой системы атомарно
    await files.rename(tmp, file);
    return { ok: true };
  } catch (error) {
    await files.remove(tmp).catch(() => undefined);
    return { ok: false, message: error instanceof Error ? error.message : 'Ошибка записи' };
  }
}

/** Недописанный временный файл с прошлого запуска — мусор, его удаляют при старте. */
export async function dropStaleTmp(files: FileAccess, tmp: string = TMP_FILE): Promise<boolean> {
  const stale = await files.read(tmp);
  if (stale === null) return false;
  await files.remove(tmp);
  return true;
}
