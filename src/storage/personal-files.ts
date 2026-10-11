/**
 * Файл личных данных: тренировки, вес, замеры. HOUSEHOLD_SPEC, раздел 10.
 *
 * Как бюджет — только в этом телефоне, в облако не уходит.
 */

import { emptyPersonal, parsePersonal, type PersonalDoc } from '../personal/doc';
import type { FileAccess } from './files';
import { LocalDocFile } from './local-doc-file';
import { PERSONAL_FILE, PERSONAL_TMP } from './paths';

export class PersonalFiles extends LocalDocFile<PersonalDoc> {
  constructor(files: FileAccess) {
    super(files, {
      target: { file: PERSONAL_FILE, tmp: PERSONAL_TMP },
      brokenPrefix: 'personal-broken',
      brokenNote: 'Файл тренировок и замеров не прочитался — он отложен рядом, а здесь начато с чистого листа',
      parse: parsePersonal,
      empty: emptyPersonal,
    });
  }
}
