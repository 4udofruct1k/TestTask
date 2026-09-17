/**
 * Полоса «Вернуть». Подтверждающих диалогов на обратимом нет —
 * отмена дешевле вопроса (3.3).
 */

import { useEffect, type JSX } from 'react';
import { UNDO_MS, useBudget } from '../../store/budget';

export function UndoBar(): JSX.Element {
  const entry = useBudget((s) => s.undoEntry);
  const undo = useBudget((s) => s.undo);
  const clearUndo = useBudget((s) => s.clearUndo);

  useEffect(() => {
    if (!entry) return;
    const timer = setTimeout(clearUndo, UNDO_MS);
    return () => clearTimeout(timer);
  }, [entry, clearUndo]);

  return (
    <div className={`undo${entry ? ' on' : ''}`} role="status">
      <span>{entry?.label ?? ''}</span>
      <button onClick={undo}>Вернуть</button>
    </div>
  );
}
