/**
 * Состояние интерфейса: экран, шторка, тема, выбранный месяц.
 * Документа здесь нет — он живёт в budget store.
 */

import { create } from 'zustand';
import type { MonthKey } from '../domain/types';
import { applyPalette, DEFAULT_PALETTE, loadPalette, savePalette, type Palette, type PaletteRole } from '../ui/palette';

/** Разделы бюджета. Остальные экраны — общие разделы дома и главная с плитками */
export type BudgetScreen = 'home' | 'expenses' | 'savings' | 'dashboards' | 'dashboard' | 'calendar' | 'settings';
export type Screen = 'hub' | 'shop' | 'cook' | 'food' | 'household' | BudgetScreen;

const BUDGET_SCREENS: readonly Screen[] = ['home', 'expenses', 'savings', 'dashboards', 'dashboard', 'calendar', 'settings'];
export const isBudgetScreen = (screen: Screen): screen is BudgetScreen => BUDGET_SCREENS.includes(screen);

/** Куда ведёт «Назад». null — дальше некуда, главная с плитками */
export function parentOf(screen: Screen): Screen | null {
  switch (screen) {
    case 'hub':
      return null;
    case 'dashboard':
      return 'dashboards';
    case 'calendar':
      return 'expenses';
    case 'expenses':
    case 'savings':
    case 'dashboards':
    case 'settings':
      return 'home';
    default:
      return 'hub';
  }
}
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
  /** Цвета интерфейса. Хранятся рядом с темой: это оформление, не данные учёта */
  palette: Palette;
  /** Онбординг идёт. Держится отдельно от статуса документа: первый же шаг
      создаёт документ, и по статусу экран бы схлопнулся на середине (3.11) */
  onboarding: boolean;

  go(screen: Screen): void;
  /** Системная «Назад»: закрыть меню или подняться на уровень. false — уже на главной */
  back(): boolean;
  openDashboard(id: string): void;
  setDrawer(open: boolean): void;
  setTab(tab: ExpensesTab): void;
  setFilter(filter: HistoryFilter): void;
  setMonth(month: MonthKey): void;
  setOnboarding(value: boolean): void;
  toggleTheme(): void;
  setPaletteRole(role: PaletteRole, color: string): void;
  setPalette(palette: Palette): void;
  resetPalette(): void;
}

export const useUi = create<UiState>()((set, get) => ({
  screen: 'hub',
  dashboardId: null,
  drawerOpen: false,
  tab: 'add',
  filter: 'all',
  month: null,
  theme: readTheme(),
  palette: loadPalette(),
  onboarding: false,

  go: (screen) => set({ screen, drawerOpen: false }),
  back: () => {
    const { drawerOpen, screen } = get();
    if (drawerOpen) {
      set({ drawerOpen: false });
      return true;
    }
    const parent = parentOf(screen);
    if (parent === null) return false;
    set({ screen: parent });
    return true;
  },
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

  setPaletteRole: (role, color) => {
    const palette: Palette = { ...get().palette, [role]: color.toUpperCase() };
    applyPalette(palette);
    savePalette(palette);
    set({ palette });
  },

  setPalette: (palette) => {
    applyPalette(palette);
    savePalette(palette);
    set({ palette });
  },

  resetPalette: () => {
    applyPalette(DEFAULT_PALETTE);
    savePalette(DEFAULT_PALETTE);
    set({ palette: DEFAULT_PALETTE });
  },
}));
