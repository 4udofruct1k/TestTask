/**
 * Файл общих данных в телефоне. HOUSEHOLD_SPEC, раздел 6.
 *
 * Отдельно от бюджета: другой формат, другая судьба. Бюджет — главный
 * документ человека, у него снимки и миграции. Здесь главное хранится
 * в облаке, а в телефоне — его копия и очередь своих изменений. Поэтому
 * запись та же атомарная, а снимков нет: потерянную копию облако вернёт.
 */

import { emptyLocal, parseLocal, type HouseholdLocal } from '../household/local';
import { atomicWrite, dropStaleTmp, type WriteResult } from './atomic';
import type { FileAccess } from './files';
import { HOUSEHOLD_FILE, HOUSEHOLD_TMP } from './paths';

const TARGET = { file: HOUSEHOLD_FILE, tmp: HOUSEHOLD_TMP };

export type HouseholdLoad = { local: HouseholdLocal; note: string | null };

export class HouseholdFiles {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly files: FileAccess) {}

  async load(): Promise<HouseholdLoad> {
    await dropStaleTmp(this.files, HOUSEHOLD_TMP);
    const text = await this.files.read(HOUSEHOLD_FILE);
    if (text === null) return { local: emptyLocal(), note: null };
    const local = parseLocal(text);
    if (local) return { local, note: null };
    // Нечитаемый файл не стирается молча: откладывается рядом, чтобы его
    // можно было достать, а работа начинается с чистого листа
    await this.files.rename(HOUSEHOLD_FILE, `household-broken-${Date.now()}.json`).catch(() => undefined);
    return { local: emptyLocal(), note: 'Файл общих данных не прочитался. Свежая копия придёт из облака при сводке' };
  }

  /** Дождаться, пока лягут все начатые записи. */
  async idle(): Promise<void> {
    await this.chain;
  }

  /** Записи идут строго друг за другом: две сразу затёрли бы общий временный файл. */
  save(local: HouseholdLocal): Promise<WriteResult> {
    const next = this.chain.then(() => atomicWrite(this.files, JSON.stringify(local), TARGET));
    this.chain = next.catch(() => undefined);
    return next;
  }
}
