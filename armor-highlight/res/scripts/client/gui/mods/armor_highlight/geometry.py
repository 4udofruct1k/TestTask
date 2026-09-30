# -*- coding: utf-8 -*-
# Чистая математика: радиус области, уровни сетки, строки внутри круга. Без BigWorld и GUI — тестируется офлайн.
# Координаты сетки: ячейка (i, j) — квадрат cellPx x cellPx, точка расчёта в его центре; j растёт вниз, как на экране.
# Уровень k: ячейки с шагом 2**k, их (i, j) кратны 2**k. Ячейки крупного уровня — подмножество мелкого,
# поэтому посчитанное на одном уровне годится и на другом.
import math

# Предел уровня: шаг 2**8 базовых ячеек заведомо больше экрана.
MAX_LEVEL = 8


def circleRadiusClip(dispAngle, fov, aspect, adjustment, maxSizePercent):
    # Радиус круга сведения в clip-координатах: (r_x, r_y). Раздел 2.2.
    ry = math.tan(dispAngle) / math.tan(fov * 0.5) * adjustment
    ry = min(ry, maxSizePercent / 100.0)
    return (ry / aspect, ry)


def gridLevel(radius, maxSamples):
    # Наименьший уровень, на котором в круге радиуса radius (в ячейках) не больше maxSamples ячеек.
    maxSamples = max(1, maxSamples)
    area = math.pi * radius * radius
    level = 0
    while level < MAX_LEVEL and area / float(4 ** level) > maxSamples:
        level += 1

    return level


def _ceilTo(value, step):
    return int(math.ceil(value / float(step))) * step


def _floorTo(value, step):
    return int(math.floor(value / float(step))) * step


def rowRanges(u, v, radius, step):
    # Строки ячеек шага step, чьи центры внутри круга (u, v, radius). Всё в ячейках.
    # Возвращает кортеж (j, iLo, iHi): i от iLo до iHi включительно с шагом step.
    if radius <= 0.0:
        return ()
    rows = []
    r2 = radius * radius
    for j in xrange(_ceilTo(v - radius, step), _floorTo(v + radius, step) + 1, step):
        dy = j - v
        rest = r2 - dy * dy
        if rest < 0.0:
            continue
        half = math.sqrt(rest)
        iLo = _ceilTo(u - half, step)
        iHi = _floorTo(u + half, step)
        if iLo <= iHi:
            rows.append((j, iLo, iHi))

    return tuple(rows)


def cellCount(rows, step):
    return sum(((iHi - iLo) // step + 1 for _, iLo, iHi in rows))


def refineOrder(u, v, radius, level, extraLevels):
    # Порядок расчёта от крупного к мелкому: сначала грубая картинка, потом детали.
    # Возвращает (order, refresh): order — все уровни от level + extraLevels до level (с повторами),
    # refresh — ячейки уровня level для периодического пересчёта.
    order = []
    refresh = []
    for lvl in xrange(min(level + extraLevels, MAX_LEVEL), level - 1, -1):
        step = 1 << lvl
        cells = [ (i, j) for j, iLo, iHi in rowRanges(u, v, radius, step) for i in xrange(iLo, iHi + 1, step) ]
        order.extend(cells)
        if lvl == level:
            refresh = cells

    return (order, refresh)


def keyLevel(i, j, maxLevel):
    # Самый крупный уровень (не выше maxLevel), которому принадлежит ячейка (i, j).
    bits = i | j
    if bits == 0:
        return maxLevel
    return min((bits & -bits).bit_length() - 1, maxLevel)


def aimFactor(baseAngle, curAngle, power):
    # min(1, (baseAngle / curAngle) ** power): подсветка тускнеет, пока прицел не сведён. Раздел 2.4.
    if curAngle <= 0.0:
        return 1.0
    return min(1.0, (baseAngle / curAngle) ** power)


def quantize(value, steps):
    # value из [0, 1] -> целый уровень 0..steps.
    return max(0, min(steps, int(round(value * steps))))
