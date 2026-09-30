# -*- coding: utf-8 -*-
# Сетка ячеек, привязанная к точке на цели (якорю). Без BigWorld и GUI — тестируется офлайн (tests/test_lattice.py).
# Якорь проецируется на экран каждый кадр, ячейка (i, j) — квадрат со стороной cellPx со смещением (i, j) * cellPx
# от якоря. Поэтому при повороте камеры ячейки едут вместе с целью, а посчитанные результаты остаются верными.
# Кэш сбрасывается вместе с сеткой: другая цель, зум, разрешение или заметно изменилась дистанция до якоря.
import math

from gui.mods.armor_highlight import geometry

_MISSING = object()


class Lattice(object):

    def __init__(self, target, anchorLocal, anchorDist, fov, screenSize, cellPx, maxSamples, extraLevels, drawable):
        self.target = target
        self.anchorLocal = anchorLocal
        self.cellPx = cellPx
        self.cache = {}
        self.level = None
        self.drawRows = ()
        self.__anchorDist = anchorDist
        self.__fov = fov
        self.__screenSize = screenSize
        self.__maxSamples = maxSamples
        self.__extraLevels = extraLevels
        self.__drawable = frozenset(drawable)
        self.__topLevel = 0
        self.__fallbackMasks = ()
        self.__computeKey = None
        self.__order = []
        self.__orderPos = 0
        self.__refresh = []
        self.__cursor = 0
        self.__refreshLeft = 0
        self.__rowRuns = {}
        self.__dirtyRows = set()
        self.__lastDrawRows = None

    def matches(self, target, fov, screenSize):
        return target is self.target and screenSize == self.__screenSize and abs(fov - self.__fov) <= 1e-4 * abs(self.__fov)

    def scaleDrift(self, anchorDist):
        # Относительное изменение дистанции камера—якорь: от него зависит масштаб цели на экране.
        if self.__anchorDist <= 0.0:
            return float('inf')
        return abs(anchorDist / self.__anchorDist - 1.0)

    @property
    def step(self):
        return 1 << self.level

    def setView(self, u, v, radius):
        # Круг сведения в ячейках относительно якоря: центр (u, v), радиус radius. Вызывается каждый кадр.
        level = geometry.gridLevel(radius, self.__maxSamples)
        if level != self.level:
            self.level = level
            self.__topLevel = min(level + self.__extraLevels, geometry.MAX_LEVEL)
            self.__fallbackMasks = tuple((~((1 << lvl) - 1) for lvl in xrange(level + 1, self.__topLevel + 1)))
            self.__rowRuns.clear()
            self.__dirtyRows.clear()
            self.__lastDrawRows = None
        step = 1 << level
        self.drawRows = geometry.rowRanges(u, v, radius, step)
        # Область расчёта чуть шире круга и квантована, чтобы порядок расчёта не перестраивался каждый кадр.
        quant = 2 * step
        qu = int(round(u / quant)) * quant
        qv = int(round(v / quant)) * quant
        qr = (int(math.ceil(radius / quant)) + 1) * quant
        computeKey = (level, qu, qv, qr)
        if computeKey != self.__computeKey:
            self.__computeKey = computeKey
            self.__order, self.__refresh = geometry.refineOrder(qu, qv, qr, level, self.__extraLevels)
            self.__orderPos = 0
        # За кадр каждая ячейка пересчитывается не больше раза.
        self.__refreshLeft = len(self.__refresh)

    def nextKey(self):
        # Сначала непосчитанные ячейки от крупного уровня к мелкому, затем пересчёт по кругу.
        cache = self.cache
        order = self.__order
        pos = self.__orderPos
        count = len(order)
        while pos < count:
            key = order[pos]
            pos += 1
            if key not in cache:
                self.__orderPos = pos
                return key

        self.__orderPos = pos
        if self.__refreshLeft <= 0:
            return None
        self.__refreshLeft -= 1
        refresh = self.__refresh
        key = refresh[self.__cursor % len(refresh)]
        self.__cursor += 1
        return key

    def store(self, key, result):
        # result: SHOT_RESULT или None (в точке нет цели).
        cache = self.cache
        old = cache.get(key, _MISSING)
        cache[key] = result
        if old is not _MISSING and old == result:
            return
        # Ячейка крупного уровня подменяет ещё не посчитанные мелкие ячейки под собой: строки j .. j + 2**top - 1.
        i, j = key
        top = geometry.keyLevel(i, j, self.__topLevel)
        if top <= self.level:
            self.__dirtyRows.add(j)
        else:
            self.__dirtyRows.update(xrange(j, j + (1 << top), 1 << self.level))

    def runs(self):
        # Ячейки круга, слитые в полосы по строкам: [(result, i0, i1, j)], i0 <= i < i1, высота полосы — step.
        # Возвращает (runs, changed): changed — полосы изменились с прошлого вызова.
        rowRuns = self.__rowRuns
        changed = False
        if self.__dirtyRows:
            for j in self.__dirtyRows:
                if rowRuns.pop(j, None) is not None:
                    changed = True

            self.__dirtyRows.clear()
        if self.drawRows != self.__lastDrawRows:
            self.__lastDrawRows = self.drawRows
            changed = True
        out = []
        for j, iLo, iHi in self.drawRows:
            entry = rowRuns.get(j)
            if entry is None or entry[0] != iLo or entry[1] != iHi:
                entry = (iLo, iHi, self.__buildRow(j, iLo, iHi))
                rowRuns[j] = entry
                changed = True
            out.extend(entry[2])

        return (out, changed)

    def __buildRow(self, j, iLo, iHi):
        step = 1 << self.level
        get = self.cache.get
        masks = self.__fallbackMasks
        drawable = self.__drawable
        runs = []
        runKind = None
        runStart = iLo
        for i in xrange(iLo, iHi + 1, step):
            kind = get((i, j), _MISSING)
            if kind is _MISSING:
                # Пока ячейка не посчитана, показываем результат ближайшей посчитанной крупной ячейки над ней.
                kind = None
                for mask in masks:
                    parent = get((i & mask, j & mask), _MISSING)
                    if parent is not _MISSING:
                        kind = parent
                        break

            if kind != runKind:
                if runKind in drawable:
                    runs.append((runKind, runStart, i, j))
                runKind = kind
                runStart = i

        if runKind in drawable:
            runs.append((runKind, runStart, iHi + step, j))
        return runs

    def summary(self):
        # Для строки статистики: (ячеек в круге, {result: n} и непосчитанные в области расчёта).
        counts = {}
        pending = 0
        cache = self.cache
        for key in self.__refresh:
            value = cache.get(key, _MISSING)
            if value is _MISSING:
                pending += 1
            else:
                counts[value] = counts.get(value, 0) + 1

        drawn = geometry.cellCount(self.drawRows, 1 << self.level) if self.level is not None else 0
        return (drawn, counts, pending)
