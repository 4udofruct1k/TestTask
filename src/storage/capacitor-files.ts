/**
 * Файловый слой поверх Capacitor Filesystem. Раздел 4.1.
 *
 * Directory.Data — приватная директория приложения: не видна в файловом
 * менеджере и галерее и вычищается при удалении приложения. Отсюда
 * обязательность экспорта.
 */

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { FileAccess } from './files';

const directory = Directory.Data;

export class CapacitorFiles implements FileAccess {
  async read(path: string): Promise<string | null> {
    try {
      const result = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 });
      return typeof result.data === 'string' ? result.data : await result.data.text();
    } catch {
      // Файла нет — это не ошибка, а первый запуск
      return null;
    }
  }

  async write(path: string, data: string): Promise<void> {
    await Filesystem.writeFile({ path, data, directory, encoding: Encoding.UTF8, recursive: true });
  }

  async rename(from: string, to: string): Promise<void> {
    await Filesystem.rename({ from, to, directory, toDirectory: directory });
  }

  async remove(path: string): Promise<void> {
    try {
      await Filesystem.deleteFile({ path, directory });
    } catch {
      // Нечего удалять
    }
  }

  async list(dir: string): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({ path: dir, directory });
      return result.files.map((file) => file.name).sort();
    } catch {
      return [];
    }
  }

  async mkdir(dir: string): Promise<void> {
    try {
      await Filesystem.mkdir({ path: dir, directory, recursive: true });
    } catch {
      // Каталог уже есть
    }
  }
}
