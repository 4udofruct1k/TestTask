/**
 * Цвета интерфейса. Раздел 3.9.
 *
 * Роли ровно те, что несут смысл: деньги, добавление, предупреждение,
 * превышение. Пара градиента, разряженная часть шкалы и линия графика
 * выводятся из выбранного цвета — просить четырнадцать цветов и следить,
 * чтобы они не разъехались, пользователь не должен.
 */

import type { JSX } from 'react';
import { useUi } from '../../store/ui';
import { Sheet } from '../components/Sheet';
import { DEFAULT_PALETTE, PRESETS, ROLES, derivePair } from '../palette';

interface Props {
  open: boolean;
  onClose(): void;
}

export function ColorsSheet({ open, onClose }: Props): JSX.Element {
  const { palette, setPalette, setPaletteRole, resetPalette } = useUi();

  const activePreset = PRESETS.find((preset) =>
    ROLES.every((role) => preset.palette[role.id] === palette[role.id]),
  );
  const isDefault = ROLES.every((role) => palette[role.id] === DEFAULT_PALETTE[role.id]);

  return (
    <Sheet open={open} title="Цвета" onClose={onClose}>
      {/* Живой пример: те же градиенты, что у блока бюджета */}
      <div className="preview">
        <span className="p-money">Деньги</span>
        <span className="p-warn">Близко</span>
        <span className="p-short">Мимо</span>
        <span className="p-add">+</span>
      </div>

      <div className="field">
        <label>Готовые наборы</label>
        <div className="swatches">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="swatch"
              aria-pressed={activePreset?.id === preset.id}
              onClick={() => setPalette(preset.palette)}
            >
              <i
                style={{
                  background: `linear-gradient(90deg, ${derivePair(preset.palette.money).b}, ${
                    preset.palette.money
                  } 55%, ${preset.palette.add})`,
                }}
              />
              {preset.title}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Свои цвета</label>
        {ROLES.map((role) => (
          <div className="colorrow" key={role.id}>
            <span className="colorrow-txt">
              <span className="colorrow-t">{role.title}</span>
              <span className="colorrow-s">{role.hint}</span>
            </span>
            <input
              type="color"
              value={palette[role.id]}
              aria-label={role.title}
              onChange={(e) => setPaletteRole(role.id, e.target.value)}
            />
          </div>
        ))}
      </div>

      <p className="hint">
        Слишком светлый цвет приложение притемнит: на этих заливках лежит белый текст, и он обязан
        читаться. Фон, карточки и подписи не меняются — их задаёт тема, светлая или тёмная.
      </p>

      {!isDefault && (
        <button className="sub-more" onClick={resetPalette}>
          Вернуть цвета спецификации
        </button>
      )}
    </Sheet>
  );
}
