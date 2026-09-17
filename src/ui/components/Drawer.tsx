/**
 * Шторка навигации. Нижней панели вкладок нет (3.1).
 */

import type { JSX } from 'react';
import { useUi, type Screen } from '../../store/ui';
import { IconCoin, IconDash, IconHome, IconMoon, IconSettings, IconSun, IconVault } from '../icons';

const ITEMS: { screen: Screen; label: string; icon: JSX.Element }[] = [
  { screen: 'home', label: 'Домой', icon: <IconHome /> },
  { screen: 'expenses', label: 'Расходы', icon: <IconCoin /> },
  { screen: 'savings', label: 'Накопления', icon: <IconVault /> },
  { screen: 'dashboards', label: 'Дашборды', icon: <IconDash /> },
];

export function Drawer(): JSX.Element {
  const { screen, drawerOpen, go, setDrawer, theme, toggleTheme, setTab } = useUi();

  return (
    <>
      <button
        className={`scrim${drawerOpen ? ' on' : ''}`}
        aria-label="Закрыть меню"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawer(false)}
      />
      <nav className={`drawer${drawerOpen ? ' on' : ''}`} aria-label="Меню" aria-hidden={!drawerOpen}>
        <div className="drawer-h">Бюджет</div>
        {ITEMS.map((item) => (
          <button
            key={item.screen}
            className="nav"
            aria-current={screen === item.screen}
            onClick={() => {
              if (item.screen === 'expenses') setTab('add');
              go(item.screen);
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="drawer-bottom">
          <button className="nav" aria-current={screen === 'settings'} onClick={() => go('settings')}>
            <IconSettings />
            Настройки
          </button>
          {/* Тема переключается в один тап, без захода в настройки */}
          <button className="theme" aria-label="Сменить тему" onClick={toggleTheme}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </nav>
    </>
  );
}
