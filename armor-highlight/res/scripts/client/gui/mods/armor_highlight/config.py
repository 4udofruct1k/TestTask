# -*- coding: utf-8 -*-
# Значения по умолчанию из ARMOR_SPEC.md, разделы 2 и 7, с правками после проверки в игре (README, «Решения»).
from aih_constants import SHOT_RESULT

debug = True

# 2.1. Условия активации
# Дальность до точки прицеливания, м. 0 — без ограничения.
maxDistance = 0.0
stillSpeed = 0.5
appearDelay = 0.3

# 2.2. Область и сетка
aimingCircleAdjustment = 1.15
maxSizePercentOfWindow = 28.0
# Сторона ячейки, пикселей. Если в круге больше maxSamples ячеек, шаг удваивается: 6, 12, ... px.
cellPx = 3
maxSamples = 2500
# Сколько уровней крупнее текущего считать первыми: картинка появляется грубой и уточняется.
refineLevels = 3
# Сетка и кэш результатов строятся заново, если дистанция от камеры до якоря на цели изменилась больше чем на эту долю.
reanchorScaleChange = 0.05

# 2.4. Цвета и прозрачность. Цвета и opacity — в palette.py: они запекаются в текстуры при сборке.
fadeoffFactorWhenNotAimed = 3.0
CELL_COLORS = {SHOT_RESULT.GREAT_PIERCED: 'great',
 SHOT_RESULT.LITTLE_PIERCED: 'little',
 SHOT_RESULT.NOT_PIERCED: 'not'}
# 'texture' — у каждого результата своя текстура нужного цвета (palette.py, tools/make_textures.py).
# 'tint' — белая текстура tintTexture, цвет через colour. В 0.2.0 так квадраты вышли белыми.
colourMode = 'texture'
tintTexture = 'system/maps/col_white.dds'
# Затемнять несведённый прицел через colour в режиме texture. Выключено, пока неизвестно,
# умножает ли colour в этом клиенте текстуру или заменяет цвет (тогда квадраты снова станут белыми).
# В режиме tint затемнение работает всегда.
fadeWithColour = False

# 2.5. Обновление. 0 — каждый кадр: BigWorld.callback(0, ...) срабатывает на следующем кадре.
updateInterval = 0.0
# Бюджет расчёта точек за кадр, мс. Если сетка в него не помещается, её расчёт
# растягивается на несколько кадров, а квадраты всё равно двигаются каждый кадр.
frameBudgetMs = 2.0
# При обновлении каждый кадр время пишется в лог сводкой раз в statsInterval секунд.
statsInterval = 1.0

# 2.6. Управление: имя атрибута модуля Keys
toggleKey = 'KEY_Y'

# Глубина GUI-корней оверлея. Меньше z — ближе к экрану. В gui/__init__.py клиента:
# DEPTH_OF_Battle = 0.1, DEPTH_OF_Aim = 0.6, DEPTH_OF_VehicleMarker = 0.9.
# 0.7 — под прицелом, над маркерами техники.
overlayDepth = 0.7
# Квадраты: quadsPrecreated на цвет создаются при входе в бой, остальные — по мере надобности,
# не больше quadsCreatePerFrame за кадр и не больше quadsMaxPerColour на цвет.
quadsPrecreated = 64
quadsCreatePerFrame = 32
quadsMaxPerColour = 1500

# Ошибки в тике пишутся в лог не чаще раза в errorLogInterval секунд.
errorLogInterval = 5.0
