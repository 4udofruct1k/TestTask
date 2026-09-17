/**
 * Конверт файла. Раздел 4.2.
 *
 * Конверт несёт только метаданные. schemaVersion живёт внутри doc
 * и не дублируется здесь: два места для одного числа рано или поздно разойдутся.
 */

import type { BudgetDocument } from '../domain/types';

/** Магическая строка. Без неё посторонний JSON проходил бы первую проверку. */
export const FORMAT = 'budget-app';

export interface Envelope {
  format: string;
  savedAt: string;
  appVersion: string;
  doc: unknown;
}

export function wrap(doc: BudgetDocument, savedAt: string, appVersion: string): Envelope {
  return { format: FORMAT, savedAt, appVersion, doc };
}

/** Рабочий файл без отступов. */
export function serialize(envelope: Envelope): string {
  return JSON.stringify(envelope);
}

/** Экспортный файл с отступами: его может открыть человек. */
export function serializePretty(envelope: Envelope): string {
  return JSON.stringify(envelope, null, 2);
}

export type ParseResult =
  | { ok: true; envelope: Envelope }
  | { ok: false; reason: 'BROKEN_JSON' | 'NOT_AN_ENVELOPE' | 'WRONG_FORMAT'; message: string };

/** Проверки строго по порядку 4.5: сначала JSON, потом магическая строка. */
export function parseEnvelope(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'BROKEN_JSON', message: 'Файл не является корректным JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'NOT_AN_ENVELOPE', message: 'В файле не объект' };
  }

  const envelope = parsed as Record<string, unknown>;
  if (envelope['format'] !== FORMAT) {
    return {
      ok: false,
      reason: 'WRONG_FORMAT',
      message: `Это не файл приложения: ожидалось format "${FORMAT}"`,
    };
  }

  return {
    ok: true,
    envelope: {
      format: FORMAT,
      savedAt: typeof envelope['savedAt'] === 'string' ? envelope['savedAt'] : '',
      appVersion: typeof envelope['appVersion'] === 'string' ? envelope['appVersion'] : '',
      doc: envelope['doc'],
    },
  };
}
