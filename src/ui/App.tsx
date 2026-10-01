/**
 * Корень приложения. Загружает документ бюджета и общие данные дома,
 * разводит экраны, держит шторку и отмену.
 *
 * Первым открывается главная с плитками. Бюджет — один из разделов:
 * его первый запуск (онбординг) показывается, только когда в него зашли.
 */

import { useEffect, useState, type JSX } from 'react';
import { useBudget } from '../store/budget';
import { useHousehold } from '../store/household';
import { applyTheme, isBudgetScreen, useUi } from '../store/ui';
import { BudgetRepository, HouseholdFiles } from '../storage';
import { applyStatusBar, onBackButton, onResume, postJson } from '../platform';
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
import { CookScreen } from './household/CookScreen';
import { FoodScreen } from './household/FoodScreen';
import { HouseholdSettings } from './household/HouseholdSettings';
import { HubScreen } from './household/HubScreen';
import { ShopScreen } from './household/ShopScreen';

interface Props {
  repository: BudgetRepository;
  household: HouseholdFiles;
}

export function App({ repository, household }: Props): JSX.Element {
  const status = useBudget((s) => s.status);
  // «Заполнить заново» — только поверх настоящих данных. После сброса
  // документ пустой, и это обычный первый запуск
  const hasData = useBudget(
    (s) => s.doc !== null && (s.doc.fixedItems.length > 0 || s.doc.expenses.length > 0 || s.doc.goals.length > 0),
  );
  const error = useBudget((s) => s.error);
  const journal = useBudget((s) => s.journal);
  const restoredFrom = useBudget((s) => s.restoredFrom);
  const init = useBudget((s) => s.init);
  const initHousehold = useHousehold((s) => s.init);
  const householdReady = useHousehold((s) => s.ready);
  const { screen, theme, onboarding, setOnboarding, go } = useUi();

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

  useEffect(() => {
    void initHousehold(household, postJson);
  }, [initHousehold, household]);

  // Вернулись в приложение — новый день и, если пора, ночная сводка
  useEffect(
    () =>
      onResume(() => {
        const store = useHousehold.getState();
        store.refreshToday();
        void store.autoSync();
      }),
    [],
  );

  // Системная «Назад» поднимает на уровень, а с главной сворачивает приложение
  useEffect(() => onBackButton(() => useUi.getState().back()), []);

  const inBudget = isBudgetScreen(screen);

  if (!householdReady || (inBudget && status === 'loading')) {
    return (
      <div className="app">
        <div className="empty">Читаем файл…</div>
      </div>
    );
  }

  if (inBudget && status === 'error') {
    return (
      <div className="app">
        <div className="empty">
          <b>Документ не открылся</b>
          {error}
        </div>
      </div>
    );
  }

  if (inBudget && (onboarding || status === 'onboarding')) {
    const repeat = status === 'ready' && hasData;
    return (
      <div className="app">
        <OnboardingScreen
          repeat={repeat}
          onExit={
            repeat
              ? undefined
              : () => {
                  setOnboarding(false);
                  go('hub');
                }
          }
          onDone={() => {
            setOnboarding(false);
            go('home');
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

      {screen === 'hub' && <HubScreen />}
      {screen === 'shop' && <ShopScreen />}
      {screen === 'cook' && <CookScreen />}
      {screen === 'food' && <FoodScreen />}
      {screen === 'household' && <HouseholdSettings />}
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
