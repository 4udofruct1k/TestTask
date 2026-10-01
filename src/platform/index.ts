/**
 * Оболочка: файловый слой, жизненный цикл, статус-бар, выгрузка файла.
 * Раздел 5.8. Всё, что отличает телефон от браузера, живёт здесь.
 */

import { App } from '@capacitor/app';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Style, StatusBar } from '@capacitor/status-bar';
import { BrowserFiles, CapacitorFiles, type FileAccess, type Lifecycle } from '../storage';
import type { Post } from '../household/sync';
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

/** Возврат в приложение: из фона или после блокировки экрана. */
export function onResume(handler: () => void): () => void {
  if (!isNative()) {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') handler();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }
  const listener = App.addListener('resume', handler);
  return () => void listener.then((handle) => handle.remove());
}

/**
 * Системная кнопка «Назад» на Android. handler возвращает false, когда
 * подниматься некуда, — тогда приложение сворачивается, как обычно.
 */
export function onBackButton(handler: () => boolean): () => void {
  if (!isNative()) return () => undefined;
  const listener = App.addListener('backButton', () => {
    if (!handler()) void App.minimizeApp();
  });
  return () => void listener.then((handle) => handle.remove());
}

/** Сколько ждать облако. Холодный старт функции — пара секунд, остальное — запас на плохую связь. */
const NETWORK_TIMEOUT_MS = 20_000;

/**
 * Запрос в облако. На телефоне — системным HTTP: ему не нужны разрешения
 * CORS. В браузере — обычный fetch, разрешения даёт сама функция.
 */
export const postJson: Post = async (url, headers, body) => {
  const all = { 'Content-Type': 'application/json', ...headers };
  if (isNative()) {
    const response = await CapacitorHttp.post({
      url,
      headers: all,
      data: body,
      connectTimeout: NETWORK_TIMEOUT_MS,
      readTimeout: NETWORK_TIMEOUT_MS,
    });
    return { status: response.status, data: response.data as unknown };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'POST', headers: all, body: JSON.stringify(body), signal: controller.signal });
    return { status: response.status, data: await response.text() };
  } finally {
    clearTimeout(timer);
  }
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

/** Скопировать строку. false — буфер недоступен, пусть человек выделит сам. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Отправить строку в мессенджер системным «Поделиться». false — не вышло. */
export async function shareText(title: string, text: string): Promise<boolean> {
  try {
    if (isNative()) {
      await Share.share({ title, text });
      return true;
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text });
      return true;
    }
  } catch {
    // закрыли окно «Поделиться» — это не ошибка
    return true;
  }
  return false;
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
