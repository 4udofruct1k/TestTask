# -*- coding: utf-8 -*-
# Область вокруг центра прицела — по логике 0.3.0. Без BigWorld и GUI — тестируется офлайн (tests/test_window.py).
#
# Координаты: ячейка (i, j) — квадрат cellPx x cellPx с левым верхним углом (i * cellPx, j * cellPx) пикселей
# от якоря на цели, значение — результат в центре ячейки. Уровень k — ячейки с шагом 2**k, их (i, j) кратны 2**k,
# поэтому посчитанное на крупном уровне годится и на мелком.
#
# Круг радиуса radius px вокруг центра прицела. Если ячеек в нём больше maxCells, шаг удваивается.
# Порядок расчёта:
#   1. Непосчитанные ячейки области — от крупного уровня (шаг 2**coarseLevels ячеек) к мелкому, в каждом уровне
#      от центра. Круг сразу заполняется грубо и за несколько кадров становится точным: пока ячейка не посчитана,
#      рисуется значение ближайшей посчитанной крупной ячейки над ней.
#   2. Пересчёт по кругу: ячейки мелкого уровня по очереди от центра, каждая не больше раза за кадр. Картинка
#      обновляется целиком за несколько кадров и следит за поворотом башни и угла обзора.
# Область расчёта чуть шире круга и квантована, чтобы порядок не перестраивался каждый кадр.
# Посчитанное хранится, пока сетка жива: прицел ушёл и вернулся — картинка сразу на месте.
#
# Край круга не зависит от шага ячеек: строки ячеек обрезаются по кругу точно по горизонтали, полосками высотой
# edgePx по вертикали. Внутренняя часть строки остаётся одним прямоугольником, отдельные — только полоски у края.
import math

MAX_LEVEL = 8
_MISSING = object()


def gridLevel(radius, maxCells):
    # Наименьший уровень, на котором в круге радиуса radius (в ячейках) не больше maxCells ячеек.
    area = math.pi * radius * radius
    level = 0
    while level < MAX_LEVEL and area / float(4 ** level) > max(1, maxCells):
        level += 1

    return level


def rowRanges(u, v, radius, step):
    # Строки ячеек шага step, чьи центры в круге (u, v, radius); всё в ячейках.
    # Возвращает кортеж (j, iLo, iHi): i от iLo до iHi включительно с шагом step.
    rows = []
    half = step * 0.5
    r2 = radius * radius
    jLo = int(math.floor((v - radius - half) / step)) * step
    for j in xrange(jLo, int(math.ceil(v + radius)) + step, step):
        dy = j + half - v
        rest = r2 - dy * dy
        if rest < 0.0:
            continue
        width = math.sqrt(rest)
        iLo = int(math.ceil((u - width - half) / step)) * step
        iHi = int(math.floor((u + width - half) / step)) * step
        if iLo <= iHi:
            rows.append((j, iLo, iHi))

    return tuple(rows)


def keyLevel(i, j, maxLevel):
    # Самый крупный уровень (не выше maxLevel), которому принадлежит ячейка (i, j).
    bits = i | j
    if bits == 0:
        return maxLevel
    return min((bits & -bits).bit_length() - 1, maxLevel)


def refineOrder(u, v, radius, level, topLevel):
    # (порядок, пересчёт): порядок — ячейки уровней от topLevel до level, в каждом от центра (с повторами:
    # крупная ячейка есть и в мелких уровнях); пересчёт — ячейки уровня level от центра.
    order = []
    refresh = []
    for lvl in xrange(topLevel, level - 1, -1):
        step = 1 << lvl
        half = step * 0.5
        cells = [ (i, j) for j, iLo, iHi in rowRanges(u, v, radius, step) for i in xrange(iLo, iHi + 1, step) ]
        cells.sort(key=lambda key: (key[0] + half - u) ** 2 + (key[1] + half - v) ** 2)
        order.extend(cells)
        if lvl == level:
            refresh = cells

    return (order, refresh)


class AimWindow(object):

    def __init__(self, cellPx, drawable, aim, radius, maxCells, coarseLevels, edgePx=4):
        # aim — центр прицела в пикселях от якоря; обновляется каждый кадр через setAim().
        self.cellPx = cellPx
        # Ключ ячейки в пикселях: точка расчёта — ((i + 0.5) * keyScale, (j + 0.5) * keyScale) от якоря.
        self.keyScale = cellPx
        self.drawable = frozenset(drawable)
        self.radius = float(radius)
        self.edgePx = edgePx
        self.cache = {}
        self.level = gridLevel(self.radius / cellPx, maxCells)
        self.topLevel = min(self.level + coarseLevels, MAX_LEVEL)
        self.done = False
        self.hasPicture = True
        self.stale = False
        self.cycles = 0
        self.__masks = tuple((~((1 << lvl) - 1) for lvl in xrange(self.level + 1, self.topLevel + 1)))
        self.__aim = aim
        self.__computeKey = None
        # Порядок расчёта для центра, сдвинутого на кратное шагу верхнего уровня, — тот же, только сдвинутый:
        # (u mod M, v mod M, r) -> (порядок, число ячеек пересчёта).
        self.__patterns = {}
        self.__order = []
        self.__orderPos = 0
        self.__refresh = []
        self.__cursor = 0
        self.__refreshLeft = 0
        self.__drawRows = ()
        self.__rowRuns = {}
        self.__dirtyRows = set()
        self.__clipCenter = None
        self.__rects = []
        self.__rectsDirty = True
        self.setAim(aim)

    # --- прицел ---

    def setAim(self, aim):
        # Вызывается каждый кадр: круг для рисования, область расчёта и лимит пересчёта на кадр.
        self.__aim = aim
        cell = float(self.cellPx)
        u = aim[0] / cell
        v = aim[1] / cell
        radius = self.radius / cell
        step = 1 << self.level
        # Строки блоков, задевающих круг (центр не дальше радиуса плюс шаг); лишнее отрежет край круга.
        drawRows = rowRanges(u, v, radius + step, step)
        if drawRows != self.__drawRows:
            self.__drawRows = drawRows
            self.__rectsDirty = True
        quant = 2 * step
        qu = int(round(u / quant)) * quant
        qv = int(round(v / quant)) * quant
        qr = (int(math.ceil(radius / quant)) + 1) * quant
        computeKey = (qu, qv, qr)
        if computeKey != self.__computeKey:
            self.__computeKey = computeKey
            period = 1 << self.topLevel
            bu = qu % period
            bv = qv % period
            pattern = self.__patterns.get((bu, bv, qr))
            if pattern is None:
                order, refresh = refineOrder(bu, bv, qr, self.level, self.topLevel)
                pattern = self.__patterns[bu, bv, qr] = (order, len(refresh))
            order, refreshCount = pattern
            du = qu - bu
            dv = qv - bv
            if du or dv:
                order = [ (i + du, j + dv) for i, j in order ]
            # Ячейки пересчёта — последний, мелкий уровень порядка.
            self.__order = order
            self.__refresh = order[len(order) - refreshCount:]
            self.__orderPos = 0
            self.__cursor = 0
            self.done = False
        # За кадр каждая ячейка пересчитывается не больше раза.
        self.__refreshLeft = len(self.__refresh)

    @property
    def aim(self):
        return self.__aim

    @property
    def stepPx(self):
        # Сторона ячейки на экране с учётом шага: при большом круге шаг растёт.
        return self.cellPx << self.level

    # --- расчёт ---

    def nextKey(self):
        # Сначала непосчитанные ячейки от крупного уровня к мелкому, затем пересчёт по кругу; None — на этот кадр всё.
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
        self.done = True
        refresh = self.__refresh
        if self.__refreshLeft <= 0 or not refresh:
            return None
        self.__refreshLeft -= 1
        idx = self.__cursor % len(refresh)
        if idx == len(refresh) - 1:
            self.cycles += 1
        self.__cursor += 1
        return refresh[idx]

    def store(self, key, value):
        # value — значение ячейки key, которую вернул nextKey().
        cache = self.cache
        old = cache.get(key, _MISSING)
        cache[key] = value
        if old is not _MISSING and old == value:
            return
        # Крупная ячейка подменяет ещё не посчитанные мелкие под собой: строки j .. j + 2**top - 1.
        i, j = key
        top = keyLevel(i, j, self.topLevel)
        if top <= self.level:
            self.__dirtyRows.add(j)
        else:
            self.__dirtyRows.update(xrange(j, j + (1 << top), 1 << self.level))
        self.__rectsDirty = True

    def probe(self):
        # Перепроверки, как в lattice.py, не нужны: круг и так пересчитывается непрерывно.
        return None

    def summary(self):
        # Для строки статистики.
        pending = sum((1 for key in self.__refresh if key not in self.cache))
        return 'cell=%dpx step=%d aim area r=%dpx cells=%d pending=%d cycles=%d' % (self.cellPx,
         1 << self.level,
         self.radius,
         len(self.__refresh),
         pending,
         self.cycles)

    # --- растр ---

    def __buildRow(self, j, iLo, iHi):
        # Интервалы строки j: (значение, i0, i1), i1 не включён.
        step = 1 << self.level
        get = self.cache.get
        masks = self.__masks
        drawable = self.drawable
        runs = []
        runValue = None
        runStart = iLo
        for i in xrange(iLo, iHi + 1, step):
            value = get((i, j), _MISSING)
            if value is _MISSING:
                # Пока ячейка не посчитана, показываем значение ближайшей посчитанной крупной ячейки над ней.
                value = None
                for mask in masks:
                    parent = get((i & mask, j & mask), _MISSING)
                    if parent is not _MISSING:
                        value = parent
                        break

            if value not in drawable:
                value = None
            if value != runValue:
                if runValue is not None:
                    runs.append((runValue, runStart, i))
                runValue = value
                runStart = i

        if runValue is not None:
            runs.append((runValue, runStart, iHi + step))
        return tuple(runs)

    def rects(self):
        # [(value, x0, y0, x1, y1)] в пикселях от якоря и признак, что список изменился с прошлого вызова.
        # Часть строки ячеек, целиком лежащая в круге, — прямоугольники на всю высоту строки (одинаковые у соседних
        # строк сливаются); у края — полоски высотой edgePx, обрезанные по кругу (одинаковые соседние сливаются).
        ax, ay = self.__aim
        center = (int(math.floor(ax + 0.5)), int(math.floor(ay + 0.5)))
        if center != self.__clipCenter:
            self.__clipCenter = center
            self.__rectsDirty = True
        if not self.__rectsDirty:
            return (self.__rects, False)
        self.__rectsDirty = False
        rowRuns = self.__rowRuns
        for j in self.__dirtyRows:
            rowRuns.pop(j, None)

        self.__dirtyRows.clear()
        cx, cy = center
        r2 = self.radius * self.radius
        step = 1 << self.level
        cell = self.cellPx
        height = step * cell
        edge = max(cell, min(self.edgePx, height))
        rects = []
        opened = {}
        lastJ = None
        for j, iLo, iHi in self.__drawRows:
            entry = rowRuns.get(j)
            if entry is None or entry[0] != iLo or entry[1] != iHi:
                entry = rowRuns[j] = (iLo, iHi, self.__buildRow(j, iLo, iHi))
            y0 = j * cell
            y1 = y0 + height
            # Полоски строки: (ys, ye, xl, xr) — часть круга в полоске, пустая вне круга.
            slivers = []
            for ys in xrange(y0, y1, edge):
                ye = min(ys + edge, y1)
                dy = (ys + ye) * 0.5 - cy
                rest = r2 - dy * dy
                if rest <= 0.0:
                    slivers.append((ys, ye, cx, cx))
                    continue
                width = math.sqrt(rest)
                slivers.append((ys, ye, int(math.floor(cx - width + 0.5)), int(math.floor(cx + width + 0.5))))

            # Часть строки внутри круга во всех полосках: [inner0, inner1).
            inner0 = max((sliver[2] for sliver in slivers))
            inner1 = min((sliver[3] for sliver in slivers))
            runs = [ (value, i0 * cell, i1 * cell) for value, i0, i1 in entry[2] ]
            if lastJ is None or j != lastJ + step:
                opened = {}
            current = {}
            if inner0 < inner1:
                for value, x0, x1 in runs:
                    a = max(x0, inner0)
                    b = min(x1, inner1)
                    if a >= b:
                        continue
                    run = (value, a, b)
                    idx = opened.get(run)
                    if idx is None:
                        idx = len(rects)
                        rects.append([value, a, y0, b, y1])
                    else:
                        rects[idx][4] = y1
                    current[run] = idx

            opened = current
            lastJ = j
            last = None
            for ys, ye, xl, xr in slivers:
                pieces = []
                if xl < xr:
                    spans = ((xl, min(xr, inner0)), (max(xl, inner1), xr)) if inner0 < inner1 else ((xl, xr),)
                    for s0, s1 in spans:
                        for value, x0, x1 in runs:
                            a = max(x0, s0)
                            b = min(x1, s1)
                            if a < b:
                                pieces.append((value, a, b))

                pieces = tuple(pieces)
                if last is not None and last[0] == pieces:
                    for idx in last[1]:
                        rects[idx][4] = ye

                    continue
                idxs = []
                for value, a, b in pieces:
                    idxs.append(len(rects))
                    rects.append([value, a, ys, b, ye])

                last = (pieces, idxs)

        rects = [ tuple(rect) for rect in rects ]
        if rects == self.__rects:
            return (self.__rects, False)
        self.__rects = rects
        return (rects, True)
