/**
 * Файловый доступ за интерфейсом. Раздел 4.3.
 *
 * Интерфейс нужен не ради архитектурной чистоты: обрыв записи (4.10, К1)
 * воспроизводится подменой этого слоя, а не убийством процесса.
 */

export interface FileAccess {
  /** null — файла нет. */
  read(path: string): Promise<string | null>;
  write(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Имена файлов в каталоге без пути. Пустой массив, если каталога нет. */
  list(dir: string): Promise<string[]>;
  mkdir(dir: string): Promise<void>;
}

/** Реализация в памяти: тесты и режим разработки в браузере. */
export class MemoryFiles implements FileAccess {
  private readonly data = new Map<string, string>();
  private readonly dirs = new Set<string>();

  async read(path: string): Promise<string | null> {
    return this.data.get(path) ?? null;
  }

  async write(path: string, data: string): Promise<void> {
    this.data.set(path, data);
  }

  async rename(from: string, to: string): Promise<void> {
    const value = this.data.get(from);
    if (value === undefined) throw new Error(`Нет файла ${from}`);
    this.data.set(to, value);
    this.data.delete(from);
  }

  async remove(path: string): Promise<void> {
    this.data.delete(path);
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const out: string[] = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
        out.push(key.slice(prefix.length));
      }
    }
    return out.sort();
  }

  async mkdir(dir: string): Promise<void> {
    this.dirs.add(dir);
  }

  /** Только для тестов: подсмотреть содержимое. */
  peek(path: string): string | null {
    return this.data.get(path) ?? null;
  }

  has(path: string): boolean {
    return this.data.has(path);
  }
}
