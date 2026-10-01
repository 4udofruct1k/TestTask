import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { BudgetRepository, HouseholdFiles, systemClock } from './storage';
import { createFiles, isNative, lifecycle } from './platform';
import { APP_VERSION } from './version';
import { applyPalette, loadPalette } from './ui/palette';
import './ui/fonts.css';
import './ui/theme.css';
import './ui/household.css';

const files = createFiles();

const repository = new BudgetRepository({
  files,
  clock: systemClock,
  appVersion: APP_VERSION,
  lifecycle,
});

// Общие данные дома — отдельный файл рядом с бюджетом
const household = new HouseholdFiles(files);

const root = document.getElementById('root');
if (!root) throw new Error('Нет корневого элемента');

/**
 * Офлайн для веб-версии: страница на «Домой» обязана открываться без сети.
 * В приложении под Capacitor не нужен — файлы и так на устройстве.
 */
function registerServiceWorker(): void {
  if (isNative() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).catch(() => {
      // Без сервис-воркера приложение работает, просто требует сети на первый заход
    });
  });
}

async function start(): Promise<void> {
  // До первой отрисовки, иначе экран мигнёт цветами по умолчанию
  applyPalette(loadPalette());
  if (import.meta.env.DEV) {
    const { applyDevFlags } = await import('./dev');
    await applyDevFlags(files);
  }
  registerServiceWorker();
  createRoot(root!).render(
    <StrictMode>
      <App repository={repository} household={household} />
    </StrictMode>,
  );
}

void start();
