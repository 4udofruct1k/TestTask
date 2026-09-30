# -*- coding: utf-8 -*-
# Адаптивная сетка, привязанная к точке на цели (якорю). Без BigWorld и GUI — тестируется офлайн (tests/test_lattice.py).
#
# Координаты — пиксели экрана относительно якоря: x вправо, y вниз. Блок уровня k — квадрат 2**k px с левым
# верхним углом (i, j), кратным 2**k. Значение блока — результат в центре его левого верхнего пикселя, поэтому
# блок и его левый верхний потомок делят один расчёт.
#
# Порядок расчёта:
#   1. Корни уровня top покрывают область.
#   2. До уровня base блоки делятся все: равномерная сетка ловит мелкие детали.
#   3. Ниже base делятся только блоки на границе разных значений, до уровня minLevel (размер ячейки).
#      Однородная броня остаётся крупными блоками, граница цветов уточняется до пикселя.
# Внутри уровня блоки делятся от ближних к прицелу к дальним.
#
# Рисуются только окончательные блоки: ячейки minLevel и однородные блоки (проверены, границы рядом нет).
# Грубых промежуточных блоков на экране нет: подсветка не вылезает за силуэт, а края сразу пиксельные.
# Сначала появляется однородная броня, потом дорисовываются края.
#
# Отрисовка: блоки раскладываются по строкам высотой 2**minLevel, соседние интервалы одного значения
# сливаются в полосы, одинаковые полосы соседних строк — в прямоугольники.
import random

MAX_LEVEL = 8
# nextKey() возвращает BUSY, проверив столько блоков подряд без расчёта.
_CHECKS_PER_CALL = 64
BUSY = object()
_MISSING = object()


def blockCount(area, level):
    # Сколько блоков уровня level покрывают область.
    x0, y0, x1, y1 = area
    if x1 <= x0 or y1 <= y0:
        return 0
    return ((x1 - 1 >> level) - (x0 >> level) + 1) * ((y1 - 1 >> level) - (y0 >> level) + 1)


def chooseLevels(area, minLevel, uniformMax, maxRows, rootsExtra=2):
    # (minLevel, base, top). minLevel растёт, если строк больше maxRows: на огромной цели 1 px не нужен.
    height = area[3] - area[1]
    while minLevel < MAX_LEVEL and height >> minLevel > maxRows:
        minLevel += 1
    base = minLevel
    while base < MAX_LEVEL and blockCount(area, base) > uniformMax:
        base += 1
    return (minLevel, base, min(base + rootsExtra, MAX_LEVEL))


class Lattice(object):

    def __init__(self, area, minLevel, uniformMax, maxRows, drawable, aim=(0.0, 0.0)):
        # area: (x0, y0, x1, y1) в пикселях от якоря, правая и нижняя границы не включены.
        # drawable: значения, которые рисуются; остальные (None — мимо цели) — нет.
        # aim: точка прицеливания от якоря; её можно менять каждый кадр — порядок уточнения идёт от неё.
        self.area = area
        self.minLevel, self.baseLevel, self.topLevel = chooseLevels(area, minLevel, uniformMax, maxRows)
        self.drawable = frozenset(drawable)
        self.cache = {}
        self.aim = aim
        self.done = False
        self.hasPicture = False
        self.splits = 0
        self.stale = False
        self.__probeBlocks = []
        self.__rowShift = self.minLevel
        self.__rows = {}
        self.__rowRuns = {}
        self.__dirtyRows = set()
        self.__rects = []
        self.__rectsDirty = False
        self.__level = self.topLevel
        self.__isRootStage = True
        self.__jobs = self.__sorted(self.__roots())
        self.__jobIdx = 0
        self.__childIdx = 0
        self.__jobChecked = False
        self.__onlyBoundary = False
        self.__created = []

    # --- расчёт ---

    def __roots(self):
        x0, y0, x1, y1 = self.area
        top = self.topLevel
        size = 1 << top
        return [ (i, j) for j in xrange(y0 >> top << top, y1, size) for i in xrange(x0 >> top << top, x1, size) ]

    def __sorted(self, blocks):
        ax, ay = self.aim
        half = (1 << self.__level) * 0.5
        return sorted(blocks, key=lambda b: (b[0] + half - ax) ** 2 + (b[1] + half - ay) ** 2)

    def nextKey(self):
        # Следующая ячейка для расчёта, BUSY (проверено много блоков подряд, пора свериться с бюджетом кадра)
        # или None, если сетка готова.
        checks = 0
        while not self.done:
            if self.__jobIdx < len(self.__jobs):
                i, j = self.__jobs[self.__jobIdx]
                if self.__isRootStage:
                    return (i, j)
                if self.__childIdx == 0 and not self.__jobChecked:
                    # Граница проверяется лениво, по мере очереди: на тонких уровнях блоков тысячи.
                    if self.__onlyBoundary and not self.__isBoundary((i, j), self.__level + 1):
                        level = self.__level + 1
                        self.__setBlock(i, j, level, self.cache[i, j])
                        if level >= self.minLevel + 2:
                            self.__probeBlocks.append(((i, j), level))
                        self.__jobIdx += 1
                        checks += 1
                        if checks >= _CHECKS_PER_CALL:
                            return BUSY
                        continue
                    self.__jobChecked = True
                half = 1 << self.__level
                idx = self.__childIdx
                return (i + half if idx != 1 else i, j + half if idx != 0 else j)
            self.__nextStage()

        return None

    def store(self, key, value):
        # value — значение ячейки key, которую вернул nextKey().
        self.cache[key] = value
        if self.__isRootStage:
            self.__setBlock(key[0], key[1], self.topLevel, value if self.topLevel <= self.minLevel else None)
            self.__created.append(key)
            self.__jobIdx += 1
            return
        self.__childIdx += 1
        if self.__childIdx == 3:
            i, j = self.__jobs[self.__jobIdx]
            self.__split(i, j, self.__level + 1)
            self.__jobIdx += 1
            self.__childIdx = 0
            self.__jobChecked = False

    def __nextStage(self):
        # Блоки, созданные на этом уровне, становятся очередью на деление. Порядок наследуется от родителей,
        # а те шли от прицела, поэтому пересортировка не нужна.
        created = self.__created
        level = self.__level
        if not self.__isRootStage and level + 1 <= self.baseLevel:
            # Однородные блоки уровня base проверены: основная картинка уже на экране.
            self.hasPicture = True
        self.__created = []
        self.__isRootStage = False
        self.__jobs = created
        self.__jobIdx = 0
        self.__childIdx = 0
        self.__jobChecked = False
        self.__onlyBoundary = level <= self.baseLevel
        self.__level = level - 1
        if level <= self.minLevel or not created:
            self.done = True
            self.hasPicture = True
            self.__jobs = []

    def __split(self, i, j, level):
        half = 1 << level - 1
        cache = self.cache
        child = level - 1
        final = child <= self.minLevel
        for ci, cj in ((i, j), (i + half, j), (i, j + half), (i + half, j + half)):
            # Пока блок не проверен на границу, он не рисуется: None в растре.
            self.__setBlock(ci, cj, child, cache[ci, cj] if final else None)
            self.__created.append((ci, cj))

        self.splits += 1

    def valueAt(self, x, y, level):
        # Значение самого мелкого посчитанного блока уровня не ниже level, содержащего пиксель (x, y).
        cache = self.cache
        for lvl in xrange(level, self.topLevel + 1):
            mask = ~((1 << lvl) - 1)
            value = cache.get((x & mask, y & mask), _MISSING)
            if value is not _MISSING:
                return value

        return _MISSING

    def __isBoundary(self, block, level):
        # Блок на границе: у одного из 8 соседей того же размера (или крупнее) другое значение.
        # Всё, что не рисуется, считается одним значением: границу «мимо цели» / UNDEFINED уточнять незачем.
        i, j = block
        size = 1 << level
        drawable = self.drawable
        value = self.cache[i, j]
        value = value if value in drawable else None
        for x, y in ((i - size, j), (i + size, j), (i, j - size), (i, j + size), (i + size, j + size), (i - size, j - size), (i + size, j - size), (i - size, j + size)):
            other = self.valueAt(x, y, level)
            if other is _MISSING:
                continue
            if (other if other in drawable else None) != value:
                return True

        return False

    def probe(self):
        # Точка для проверки, не изменилась ли картинка: центр случайного однородного блока (не на границе,
        # не мельче 4 ячеек). Сдвиг сетки на полпикселя при округлении якоря значение в центре не меняет.
        # Возвращает (x, y, ожидаемое значение) или None.
        if not self.__probeBlocks:
            return None
        (i, j), level = random.choice(self.__probeBlocks)
        half = (1 << level) * 0.5
        return (i + half, j + half, self.cache[i, j])

    # --- растр ---

    def __setBlock(self, i, j, level, value):
        shift = self.__rowShift
        rows = self.__rows
        end = i + (1 << level)
        for row in xrange(j >> shift, j + (1 << level) >> shift):
            cells = rows.get(row)
            if cells is None:
                cells = rows[row] = {}
            cells[i] = (end, value)
            self.__dirtyRows.add(row)

    def __buildRowRuns(self, cells):
        drawable = self.drawable
        runs = []
        start = end = value = None
        for x0 in sorted(cells):
            x1, cellValue = cells[x0]
            if cellValue == value and x0 == end:
                end = x1
                continue
            if value in drawable:
                runs.append((start, end, value))
            start, end, value = x0, x1, cellValue

        if value in drawable:
            runs.append((start, end, value))
        return tuple(runs)

    def rects(self):
        # [(value, x0, y0, x1, y1)] в пикселях от якоря и признак, что список изменился с прошлого вызова.
        if self.__dirtyRows:
            rowRuns = self.__rowRuns
            rows = self.__rows
            for row in self.__dirtyRows:
                runs = self.__buildRowRuns(rows[row])
                if rowRuns.get(row) != runs:
                    rowRuns[row] = runs
                    self.__rectsDirty = True

            self.__dirtyRows.clear()
        if not self.__rectsDirty:
            return (self.__rects, False)
        self.__rectsDirty = False
        shift = self.__rowShift
        rects = []
        opened = {}
        lastRow = None
        rowRuns = self.__rowRuns
        for row in sorted(rowRuns):
            if lastRow is None or row != lastRow + 1:
                opened = {}
            current = {}
            y = row << shift
            for run in rowRuns[row]:
                idx = opened.get(run)
                if idx is None:
                    idx = len(rects)
                    rects.append([run[2], run[0], y, run[1], y + (1 << shift)])
                else:
                    rects[idx][4] = y + (1 << shift)
                current[run] = idx

            opened = current
            lastRow = row

        self.__rects = [ tuple(rect) for rect in rects ]
        return (self.__rects, True)

    @property
    def stage(self):
        # Уровень, который сейчас уточняется (после готовности — самый мелкий).
        return max(self.__level, self.minLevel)
