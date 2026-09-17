/** Шторка снизу: верх экрана остаётся виден (3.3). */

import type { JSX, ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}

export function Sheet({ open, title, onClose, children }: Props): JSX.Element {
  return (
    <>
      <button className={`scrim${open ? ' on' : ''}`} aria-label="Закрыть" tabIndex={open ? 0 : -1} onClick={onClose} />
      <div className={`qsheet${open ? ' on' : ''}`} aria-hidden={!open}>
        <div className="grip" />
        <div className="sheet-h">{title}</div>
        {open && children}
      </div>
    </>
  );
}
