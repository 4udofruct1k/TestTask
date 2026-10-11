/**
 * Небольшой документ в отдельном файле: общие данные дома, личные данные.
 *
 * Запись атомарная (4.3) со своим временным файлом, записи идут строго
 * друг за другом. Снимков и миграций нет — это не бюджет. Нечитаемый
 * файл не стирается молча: откладывается рядом, работа начинается
 * с чистого листа, а экран говорит, что случилось.
 */

import { atomicWrite, dropStaleTmp, type AtomicTarget, type WriteResult } from './atomic';
import type { FileAccess } from './files';

export interface LocalDocOptions<T> {
  target: AtomicTarget;
  /** Приставка имени отложенного нечитаемого файла */
  brokenPrefix: string;
  /** Что сказать, если файл пришлось отложить */
  brokenNote: string;
  parse(text: string): T | null;
  empty(): T;
}

export type LocalDocLoad<T> = { doc: T; note: string | null };

export class LocalDocFile<T> {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly files: FileAccess,
    private readonly options: LocalDocOptions<T>,
  ) {}

  async load(): Promise<LocalDocLoad<T>> {
    const { target, parse, empty, brokenPrefix, brokenNote } = this.options;
    await dropStaleTmp(this.files, target.tmp);
    const text = await this.files.read(target.file);
    if (text === null) return { doc: empty(), note: null };
    const doc = parse(text);
    if (doc) return { doc, note: null };
    await this.files.rename(target.file, `${brokenPrefix}-${Date.now()}.json`).catch(() => undefined);
    return { doc: empty(), note: brokenNote };
  }

  /** Дождаться, пока лягут все начатые записи. */
  async idle(): Promise<void> {
    await this.chain;
  }

  /** Записи идут строго друг за другом: две сразу затёрли бы общий временный файл. */
  save(doc: T): Promise<WriteResult> {
    const next = this.chain.then(() => atomicWrite(this.files, JSON.stringify(doc), this.options.target));
    this.chain = next.catch(() => undefined);
    return next;
  }
}
