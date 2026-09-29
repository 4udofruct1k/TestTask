# -*- coding: utf-8 -*-
# Чистая математика: радиус области, сетка, альфа. Без BigWorld и GUI — тестируется офлайн (tests/test_geometry.py).
import math

# Шаг сетки растёт такими долями базового, если точек больше maxSamples.
_STEP_SCALE_QUANT = 0.25


def circleRadiusClip(dispAngle, fov, aspect, adjustment, maxSizePercent):
    # Радиус круга сведения в clip-координатах: (r_x, r_y). Раздел 2.2.
    ry = math.tan(dispAngle) / math.tan(fov * 0.5) * adjustment
    ry = min(ry, maxSizePercent / 100.0)
    return (ry / aspect, ry)


def _ellipseOffsets(rx, ry, stepX, stepY):
    offsets = []
    if rx <= 0.0 or ry <= 0.0:
        return [(0, 0)]
    jMax = int(ry / stepY)
    for j in xrange(-jMax, jMax + 1):
        v = j * stepY / ry
        rest = 1.0 - v * v
        if rest < 0.0:
            continue
        iMax = int(rx / stepX * math.sqrt(rest))
        for i in xrange(-iMax, iMax + 1):
            offsets.append((i, j))

    return offsets


def buildGrid(rx, ry, baseStepX, baseStepY, maxSamples):
    # Узлы квадратной сетки внутри эллипса (rx, ry) как целые смещения (i, j) от центра.
    # Если узлов больше maxSamples, шаг увеличивается. Возвращает (stepScale, offsets).
    maxSamples = max(1, maxSamples)
    scale = 1.0
    offsets = _ellipseOffsets(rx, ry, baseStepX, baseStepY)
    while len(offsets) > maxSamples:
        estimate = scale * math.sqrt(float(len(offsets)) / maxSamples)
        scale = max(scale + _STEP_SCALE_QUANT, math.ceil(estimate / _STEP_SCALE_QUANT) * _STEP_SCALE_QUANT)
        offsets = _ellipseOffsets(rx, ry, baseStepX * scale, baseStepY * scale)

    return (scale, offsets)


def isInsideEllipse(dx, dy, rx, ry):
    if rx <= 0.0 or ry <= 0.0:
        return False
    u = dx / rx
    v = dy / ry
    return u * u + v * v <= 1.0


def alphaByDist(dist, fullDist, zeroDist):
    # 1 до fullDist, линейно до 0 к zeroDist. Раздел 2.4.
    if dist <= fullDist:
        return 1.0
    if dist >= zeroDist:
        return 0.0
    return (zeroDist - dist) / (zeroDist - fullDist)


def aimFactor(baseAngle, curAngle, power):
    # min(1, (baseAngle / curAngle) ** power): подсветка тускнеет, пока прицел не сведён. Раздел 2.4.
    if curAngle <= 0.0:
        return 1.0
    return min(1.0, (baseAngle / curAngle) ** power)


def alphaByte(opacity, distFactor, aimingFactor):
    value = int(round(255.0 * opacity * distFactor * aimingFactor))
    return max(0, min(255, value))
