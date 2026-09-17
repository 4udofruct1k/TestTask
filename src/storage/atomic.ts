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

export async function atomicWrite(files: FileAccess, data: string): Promise<WriteResult> {
  try {
    // 2. записать во временный
    await files.write(TMP_FILE, data);

    // 3. прочитать обратно и сверить длину — файл маленький, проверка дешёвая
    const readBack = await files.read(TMP_FILE);
    if (readBack === null || readBack.length !== data.length) {
      await files.remove(TMP_FILE).catch(() => undefined);
      return {
        ok: false,
        message: `Запись не подтвердилась: ожидалось ${data.length} символов, прочитано ${readBack?.length ?? 0}`,
      };
    }

    // 4. переименование в пределах одной файловой системы атомарно
    await files.rename(TMP_FILE, DATA_FILE);
    return { ok: true };
  } catch (error) {
    await files.remove(TMP_FILE).catch(() => undefined);
    return { ok: false, message: error instanceof Error ? error.message : 'Ошибка записи' };
  }
}

/** Недописанный временный файл с прошлого запуска — мусор, его удаляют при старте. */
export async function dropStaleTmp(files: FileAccess): Promise<boolean> {
  const stale = await files.read(TMP_FILE);
  if (stale === null) return false;
  await files.remove(TMP_FILE);
  return true;
}
