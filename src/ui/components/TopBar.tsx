/**
 * Шапка экрана. Бургер слева, стрелка назад там, где она ведёт на главную (3.1).
 */

import type { JSX, ReactNode } from 'react';
import { Burger, IconBack } from '../icons';
import { useUi } from '../../store/ui';

interface Props {
  title: string;
  sub?: ReactNode;
  /** Стрелка назад. На «Расходах» и «Дашбордах» ведёт сразу на главную */
  onBack?: () => void;
  burger?: boolean;
}

export function TopBar({ title, sub, onBack, burger = true }: Props): JSX.Element {
  const setDrawer = useUi((s) => s.setDrawer);
  return (
    <div className="bar">
      {burger && (
        <button className="icbtn" aria-label="Меню" onClick={() => setDrawer(true)}>
          <Burger />
        </button>
      )}
      {onBack && (
        <button className="icbtn" aria-label="Назад" onClick={onBack}>
          <IconBack />
        </button>
      )}
      <div className="bar-title">{title}</div>
      {sub !== undefined && <div className="bar-sub">{sub}</div>}
    </div>
  );
}
