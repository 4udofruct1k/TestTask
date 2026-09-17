/** Разворачивающаяся строка разбивки (3.2). */

import { useState, type JSX, type ReactNode } from 'react';
import { IconChevron } from '../icons';

interface Props {
  title: string;
  subtitle: string;
  value: string;
  children: ReactNode;
}

export function ExpandableRow({ title, subtitle, value, children }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className={`grp${open ? ' open' : ''}`}>
      <button className="row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chev">
          <IconChevron />
        </span>
        <span className="row-txt">
          <span className="row-t">{title}</span>
          <span className="row-s">{subtitle}</span>
        </span>
        <span className="row-v">{value}</span>
      </button>
      {open && <div className="sub">{children}</div>}
    </div>
  );
}
