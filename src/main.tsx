import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { BudgetRepository, systemClock } from './storage';
import { createFiles, lifecycle } from './platform';
import { APP_VERSION } from './version';
import './ui/fonts.css';
import './ui/theme.css';

const files = createFiles();

const repository = new BudgetRepository({
  files,
  clock: systemClock,
  appVersion: APP_VERSION,
  lifecycle,
});

const root = document.getElementById('root');
if (!root) throw new Error('Нет корневого элемента');

async function start(): Promise<void> {
  if (import.meta.env.DEV) {
    const { applyDevFlags } = await import('./dev');
    await applyDevFlags(files);
  }
  createRoot(root!).render(
    <StrictMode>
      <App repository={repository} />
    </StrictMode>,
  );
}

void start();
