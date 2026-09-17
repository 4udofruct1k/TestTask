/**
 * Корень приложения. Загружает документ, разводит экраны, держит шторку и отмену.
 */

import { useEffect, useState, type JSX } from 'react';
import { useBudget } from '../store/budget';
import { applyTheme, useUi } from '../store/ui';
import { BudgetRepository } from '../storage';
import { applyStatusBar } from '../platform';
import { Drawer } from './components/Drawer';
import { UndoBar } from './components/UndoBar';
import { CalendarScreen } from './screens/CalendarScreen';
import { DashboardDetail } from './screens/DashboardDetail';
import { DashboardsScreen } from './screens/DashboardsScreen';
import { ExpensesScreen } from './screens/ExpensesScreen';
import { SavingsScreen } from './screens/SavingsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export function App({ repository }: { repository: BudgetRepository }): JSX.Element {
  const status = useBudget((s) => s.status);
  const error = useBudget((s) => s.error);
  const journal = useBudget((s) => s.journal);
  const restoredFrom = useBudget((s) => s.restoredFrom);
  const init = useBudget((s) => s.init);
  const { screen, theme, onboarding, setOnboarding } = useUi();

  const [journalShown, setJournalShown] = useState(true);

  // Первый запуск: документа нет
  useEffect(() => {
    if (status === 'onboarding') setOnboarding(true);
  }, [status, setOnboarding]);

  useEffect(() => {
    applyTheme(theme);
    void applyStatusBar(theme);
  }, [theme]);

  useEffect(() => {
    void init(repository);
  }, [init, repository]);

  if (status === 'loading') {
    return (
      <div className="app">
        <div className="empty">Читаем файл…</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="app">
        <div className="empty">
          <b>Документ не открылся</b>
          {error}
        </div>
      </div>
    );
  }

  if (onboarding || status === 'onboarding') {
    return (
      <div className="app">
        <OnboardingScreen
          repeat={status === 'ready'}
          onDone={() => {
            setOnboarding(false);
            useUi.getState().go('home');
          }}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <Drawer />

      {/* Что поправлено при загрузке — видно, молчаливой правки не бывает (4.7) */}
      {journalShown && (journal.length > 0 || restoredFrom) && (
        <div className="journal" onClick={() => setJournalShown(false)} role="status">
          {restoredFrom && <div>Документ восстановлен из снимка {restoredFrom}.</div>}
          {journal.slice(0, 4).map((fix, i) => (
            <div key={i}>{fix.message}</div>
          ))}
          {journal.length > 4 && <div>…и ещё {journal.length - 4}</div>}
        </div>
      )}

      {screen === 'home' && <HomeScreen />}
      {screen === 'expenses' && <ExpensesScreen />}
      {screen === 'savings' && <SavingsScreen />}
      {screen === 'dashboards' && <DashboardsScreen />}
      {screen === 'dashboard' && <DashboardDetail />}
      {screen === 'calendar' && <CalendarScreen />}
      {screen === 'settings' && <SettingsScreen />}

      <UndoBar />
    </div>
  );
}
