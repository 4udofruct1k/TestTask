/**
 * Оболочка: файловый слой, жизненный цикл, статус-бар, выгрузка файла.
 * Раздел 5.8. Всё, что отличает телефон от браузера, живёт здесь.
 */

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Style, StatusBar } from '@capacitor/status-bar';
import { BrowserFiles, CapacitorFiles, type FileAccess, type Lifecycle } from '../storage';
import type { Theme } from '../store/ui';

export const isNative = (): boolean => Capacitor.isNativePlatform();

export function createFiles(): FileAccess {
  return isNative() ? new CapacitorFiles() : new BrowserFiles();
}

/** Принудительная запись, когда приложение уходит в фон (4.3). */
export const lifecycle: Lifecycle = {
  onPause(handler) {
    if (!isNative()) {
      // В браузере эквивалент — уход вкладки в фон
      const onHidden = (): void => {
        if (document.visibilityState === 'hidden') handler();
      };
      document.addEventListener('visibilitychange', onHidden);
      return () => document.removeEventListener('visibilitychange', onHidden);
    }
    const listener = App.addListener('pause', handler);
    return () => void listener.then((handle) => handle.remove());
  },
};

const BAR_BACKGROUND: Record<Theme, string> = { light: '#F1F4F1', dark: '#0B100D' };

/**
 * Статус-бар следует теме: иначе вверху экрана останется светлая полоса
 * при тёмной теме.
 */
export async function applyStatusBar(theme: Theme): Promise<void> {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_BACKGROUND[theme]);
  if (!isNative()) return;
  try {
    // Style.Dark — светлый текст для тёмной подложки, Style.Light — наоборот
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: BAR_BACKGROUND[theme] });
  } catch {
    // На вебе плагина нет
  }
}

/** Экспорт: системный Share Sheet на телефоне, обычная загрузка в браузере (4.5). */
export async function exportDocument(fileName: string, text: string): Promise<string> {
  if (!isNative()) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return 'Файл выгружен. Держите его там же, где храните важное.';
  }

  const written = await Filesystem.writeFile({
    path: fileName,
    data: text,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  await Share.share({ title: 'Бюджет', text: fileName, url: written.uri });
  return `Файл сохранён как ${fileName}.`;
}

/** Импорт: выбор файла системным диалогом. */
export async function pickImportFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void file.text().then(resolve);
    };
    input.click();
  });
}
