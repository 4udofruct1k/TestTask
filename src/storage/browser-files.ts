/**
 * Файловый слой поверх localStorage — веб-режим и разработка.
 * На устройстве его заменяет Capacitor Filesystem (4.1).
 */

import type { FileAccess } from './files';

const PREFIX = 'budget-fs:';

export class BrowserFiles implements FileAccess {
  async read(path: string): Promise<string | null> {
    return localStorage.getItem(PREFIX + path);
  }

  async write(path: string, data: string): Promise<void> {
    localStorage.setItem(PREFIX + path, data);
  }

  async rename(from: string, to: string): Promise<void> {
    const value = localStorage.getItem(PREFIX + from);
    if (value === null) throw new Error(`Нет файла ${from}`);
    localStorage.setItem(PREFIX + to, value);
    localStorage.removeItem(PREFIX + from);
  }

  async remove(path: string): Promise<void> {
    localStorage.removeItem(PREFIX + path);
  }

  async list(dir: string): Promise<string[]> {
    const prefix = `${PREFIX}${dir.endsWith('/') ? dir : `${dir}/`}`;
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const name = key.slice(prefix.length);
        if (!name.includes('/')) out.push(name);
      }
    }
    return out.sort();
  }

  async mkdir(): Promise<void> {
    // В localStorage каталогов нет
  }
}
