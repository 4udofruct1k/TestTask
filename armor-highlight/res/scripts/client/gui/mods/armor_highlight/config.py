# -*- coding: utf-8 -*-
# Значения по умолчанию из ARMOR_SPEC.md, разделы 2 и 7.
from aih_constants import SHOT_RESULT

debug = True

# 2.1. Условия активации
maxDistance = 300.0
stillSpeed = 0.5
appearDelay = 0.5

# 2.2. Область и сетка
aimingCircleAdjustment = 1.15
maxSizePercentOfWindow = 28.0
cellPx = 10
maxSamples = 250

# 2.4. Цвета и прозрачность
opacity = 0.45
fadeoffFactorWhenNotAimed = 3.0
alphaFullDist = 200.0
alphaZeroDist = 300.0
COLORS = {SHOT_RESULT.GREAT_PIERCED: (0x00, 0x80, 0x15),
 SHOT_RESULT.LITTLE_PIERCED: (0xbb, 0xa7, 0x37),
 SHOT_RESULT.NOT_PIERCED: (0x8c, 0x07, 0x12)}
COLORS_COLOR_BLIND = {SHOT_RESULT.GREAT_PIERCED: (0xff, 0xcc, 0x33),
 SHOT_RESULT.LITTLE_PIERCED: (0xd5, 0x68, 0xe3),
 SHOT_RESULT.NOT_PIERCED: (0x60, 0x25, 0xb4)}

# 2.5. Обновление. 0 — каждый кадр: BigWorld.callback(0, ...) срабатывает на следующем кадре.
updateInterval = 0.0
# Бюджет расчёта точек за кадр, мс. Если сетка в него не помещается, её пересчёт
# растягивается на несколько кадров, а позиции квадратов всё равно обновляются каждый кадр.
frameBudgetMs = 2.0
# При обновлении каждый кадр время пишется в лог сводкой раз в statsInterval секунд.
statsInterval = 1.0

# 2.6. Управление: имя атрибута модуля Keys
toggleKey = 'KEY_Y'

# Глубина GUI-корней оверлея. Меньше z — ближе к экрану. В gui/__init__.py клиента:
# DEPTH_OF_Battle = 0.1, DEPTH_OF_Aim = 0.6, DEPTH_OF_VehicleMarker = 0.9.
# 0.7 — под прицелом, над маркерами техники.
overlayDepth = 0.7
# Текстура квадратов: белая текстура движка (resources.xml клиента, <whiteBmp>), цвет задаёт colour.
# Если квадраты не видны, попробовать '' — GUI.Simple без текстуры.
cellTexture = 'system/maps/col_white.dds'

# Ошибки в тике пишутся в лог не чаще раза в errorLogInterval секунд.
errorLogInterval = 5.0
