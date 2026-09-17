/**
 * Состояние интерфейса: экран, шторка, тема, выбранный месяц.
 * Документа здесь нет — он живёт в budget store.
 */

import { create } from 'zustand';
import type { MonthKey } from '../domain/types';

export type Screen = 'home' | 'expenses' | 'goals' | 'dashboards' | 'dashboard' | 'calendar' | 'settings';
export type ExpensesTab = 'add' | 'history';
export type HistoryFilter = 'all' | 'fixed' | 'routine' | 'oneOff';
export type Theme = 'light' | 'dark';

const THEME_KEY = 'budget-theme';

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

interface UiState {
  screen: Screen;
  dashboardId: string | null;
  drawerOpen: boolean;
  tab: ExpensesTab;
  filter: HistoryFilter;
  month: MonthKey | null;
  theme: Theme;
  /** Онбординг идёт. Держится отдельно от статуса документа: первый же шаг
      создаёт документ, и по статусу экран бы схлопнулся на середине (3.11) */
  onboarding: boolean;

  go(screen: Screen): void;
  openDashboard(id: string): void;
  setDrawer(open: boolean): void;
  setTab(tab: ExpensesTab): void;
  setFilter(filter: HistoryFilter): void;
  setMonth(month: MonthKey): void;
  setOnboarding(value: boolean): void;
  toggleTheme(): void;
}

export const useUi = create<UiState>()((set, get) => ({
  screen: 'home',
  dashboardId: null,
  drawerOpen: false,
  tab: 'add',
  filter: 'all',
  month: null,
  theme: readTheme(),
  onboarding: false,

  go: (screen) => set({ screen, drawerOpen: false }),
  openDashboard: (dashboardId) => set({ screen: 'dashboard', dashboardId, drawerOpen: false }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  setTab: (tab) => set({ tab }),
  setFilter: (filter) => set({ filter }),
  setMonth: (month) => set({ month }),
  setOnboarding: (onboarding) => set({ onboarding, drawerOpen: false }),

  // Тема меняется в один тап: это то, что переключают по времени суток (3.1)
  toggleTheme: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // приватный режим — тема просто не запомнится
    }
    set({ theme });
  },
}));
