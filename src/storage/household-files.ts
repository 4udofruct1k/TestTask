/**
 * Файл общих данных в телефоне. HOUSEHOLD_SPEC, раздел 6.
 *
 * Отдельно от бюджета: другой формат, другая судьба. Бюджет — главный
 * документ человека, у него снимки и миграции. Здесь главное хранится
 * в облаке, а в телефоне — его копия и очередь своих изменений. Поэтому
 * запись та же атомарная, а снимков нет: потерянную копию облако вернёт.
 */

import { emptyLocal, parseLocal, type HouseholdLocal } from '../household/local';
import type { WriteResult } from './atomic';
import type { FileAccess } from './files';
import { LocalDocFile } from './local-doc-file';
import { HOUSEHOLD_FILE, HOUSEHOLD_TMP } from './paths';

export type HouseholdLoad = { local: HouseholdLocal; note: string | null };

export class HouseholdFiles {
  private readonly file: LocalDocFile<HouseholdLocal>;

  constructor(files: FileAccess) {
    this.file = new LocalDocFile(files, {
      target: { file: HOUSEHOLD_FILE, tmp: HOUSEHOLD_TMP },
      brokenPrefix: 'household-broken',
      brokenNote: 'Файл общих данных не прочитался. Свежая копия придёт из облака при сводке',
      parse: parseLocal,
      empty: emptyLocal,
    });
  }

  async load(): Promise<HouseholdLoad> {
    const { doc, note } = await this.file.load();
    return { local: doc, note };
  }

  idle(): Promise<void> {
    return this.file.idle();
  }

  save(local: HouseholdLocal): Promise<WriteResult> {
    return this.file.save(local);
  }
}
