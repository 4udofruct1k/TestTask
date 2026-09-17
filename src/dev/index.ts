/** Подключение режима разработки. В сборке для телефона не вызывается. */

import { serialize, wrap, type FileAccess } from '../storage';
import { DATA_FILE, BACKUP_DIR } from '../storage/paths';
import { APP_VERSION } from '../version';
import { nowIso, todayString } from '../ui/clock';
import { seedDocument } from './seed';

/**
 * ?demo — положить подставной документ на полгода истории.
 * ?fresh — стереть всё и посмотреть первый запуск.
 */
export async function applyDevFlags(files: FileAccess): Promise<void> {
  const params = new URLSearchParams(location.search);

  if (params.has('fresh')) {
    await files.remove(DATA_FILE);
    for (const name of await files.list(BACKUP_DIR)) await files.remove(`${BACKUP_DIR}/${name}`);
    return;
  }

  if (params.has('demo')) {
    const doc = seedDocument(todayString());
    await files.write(DATA_FILE, serialize(wrap(doc, nowIso(), APP_VERSION)));
  }
}
