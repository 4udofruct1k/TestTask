# -*- coding: utf-8 -*-
# Адаптивная сетка, привязанная к точке на цели (якорю). Без BigWorld и GUI — тестируется офлайн (tests/test_lattice.py).
#
# Координаты — пиксели экрана относительно якоря: x вправо, y вниз. Блок уровня k — квадрат 2**k px с левым
# верхним углом (i, j), кратным 2**k. Значение блока — результат в центре его левого верхнего пикселя, поэтому
# блок и его левый верхний потомок делят один расчёт.
#
# Порядок расчёта (обычный режим):
#   1. Равномерная проверка: корни уровня top и деление всех блоков до уровня base (шаг поиска мелких зон).
#   2. Проход по блокам base: однородные (у всех 8 соседей то же значение) сразу рисуются — сплошная броня на экране.
#   3. Уточнение: блоки на границах делятся до уровня minLevel (размер ячейки) в очереди по близости к прицелу —
#      место под прицелом становится точным первым. Недостающие значения соседей досчитываются по требованию,
#      поэтому порядок не влияет на точность.
#   В круге focusRadius вокруг прицела делится всё подряд, до каждой ячейки: там не теряются даже зоны меньше
#   шага поиска. Когда прицел уходит, круг переезжает, и однородные блоки на новом месте открываются заново.
#
# Полная проходка (fullPass): каждая ячейка области, кольцами от прицела, без адаптивности — для проверки.
#
# Рисуются только окончательные блоки: ячейки minLevel и однородные блоки. Грубых промежуточных блоков на экране нет.
# Отрисовка: блоки раскладываются по строкам высотой 2**minLevel, соседние интервалы одного значения
# сливаются в полосы, одинаковые полосы соседних строк — в прямоугольники.
import heapq
import random

MAX_LEVEL = 8
# nextKey() возвращает BUSY, проверив столько блоков подряд без расчёта.
_CHECKS_PER_CALL = 64
BUSY = object()
_MISSING = object()
# Очередь уточнения пересортировывается, когда прицел сдвинулся больше чем на столько пикселей.
_RESORT_DISTANCE = 16.0
_NEIGHBOURS = ((-1, 0), (1, 0), (0, -1), (0, 1), (1, 1), (-1, -1), (1, -1), (-1, 1))
_UNIFORM, _SWEEP, _REFINE, _FULL, _DONE = ('uniform', 'sweep', 'refine', 'full', 'done')


def blockCount(area, level):
    # Сколько блоков уровня level покрывают область.
    x0, y0, x1, y1 = area
    if x1 <= x0 or y1 <= y0:
        return 0
    return ((x1 - 1 >> level) - (x0 >> level) + 1) * ((y1 - 1 >> level) - (y0 >> level) + 1)


def chooseLevels(area, minLevel, uniformMax, maxRows, searchLevel=None, rootsExtra=2):
    # (minLevel, base, top). minLevel растёт, если строк больше maxRows: на огромной цели 1 px не нужен.
    # searchLevel — шаг поиска мелких зон из настроек (None — подобрать: не больше uniformMax блоков).
    height = area[3] - area[1]
    while minLevel < MAX_LEVEL and height >> minLevel > maxRows:
        minLevel += 1
    if searchLevel is not None:
        base = max(minLevel, min(searchLevel, MAX_LEVEL))
    else:
        base = minLevel
        while base < MAX_LEVEL and blockCount(area, base) > uniformMax:
            base += 1
    return (minLevel, base, min(base + rootsExtra, MAX_LEVEL))


class Lattice(object):

    def __init__(self, area, minLevel, uniformMax, maxRows, drawable, aim=(0.0, 0.0), searchLevel=None, focusRadius=0.0, fullPass=False):
        # area: (x0, y0, x1, y1) в пикселях от якоря, правая и нижняя границы не включены.
        # drawable: значения, которые рисуются; остальные (None — мимо цели) — нет.
        # aim: точка прицеливания от якоря; обновляется через setAim().
        self.area = area
        self.minLevel, self.baseLevel, self.topLevel = chooseLevels(area, minLevel, uniformMax, maxRows, searchLevel)
        self.drawable = frozenset(drawable)
        self.focusRadius = float(focusRadius)
        self.fullPass = fullPass
        self.cache = {}
        self.done = False
        self.hasPicture = False
        self.splits = 0
        self.stale = False
        self.__aim = aim
        self.__aimChanged = True
        self.__rowShift = self.minLevel
        self.__rows = {}
        self.__rowRuns = {}
        self.__dirtyRows = set()
        self.__rects = []
        self.__rectsDirty = False
        # Однородные окончательные блоки крупнее ячейки: (i, j) -> уровень.
        self.__uniform = {}
        self.__probeBlocks = []
        # Покрытие корнями (до края последнего корня, чуть шире области): за ним соседей нет.
        top = self.topLevel
        x0, y0, x1, y1 = area
        self.__cover = (x0 >> top << top, y0 >> top << top, (x1 - 1 >> top << top) + (1 << top), (y1 - 1 >> top << top) + (1 << top))
        # Равномерная проверка: очередь блоков текущего уровня.
        self.__level = top
        self.__jobs = self.__sortedByAim(self.__roots(), top)
        self.__jobIdx = 0
        self.__created = []
        self.__isRootStage = True
        # Уточнение: куча (приоритет, номер, i, j, уровень, отображаемое значение, нужна ли проверка).
        self.__heap = []
        self.__seq = 0
        self.__heapAim = aim
        self.__focusAim = None
        self.__job = None
        self.__sweep = None
        self.__sweepIdx = 0
        self.__pendingCell = None
        if fullPass:
            self.__phase = _FULL
            self.__cells = self.__spiral()
            self.hasPicture = True
        else:
            self.__phase = _UNIFORM

    # --- прицел ---

    def setAim(self, aim):
        if aim != self.__aim:
            self.__aim = aim
            self.__aimChanged = True

    @property
    def aim(self):
        return self.__aim

    def __sortedByAim(self, blocks, level):
        ax, ay = self.__aim
        half = (1 << level) * 0.5
        return sorted(blocks, key=lambda b: (b[0] + half - ax) ** 2 + (b[1] + half - ay) ** 2)

    def __priority(self, i, j, level):
        ax, ay = self.__aim
        half = (1 << level) * 0.5
        return (i + half - ax) ** 2 + (j + half - ay) ** 2

    def __inFocus(self, i, j, level):
        radius = self.focusRadius
        if radius <= 0.0:
            return False
        ax, ay = self.__aim
        size = 1 << level
        dx = ax - max(i, min(ax, i + size))
        dy = ay - max(j, min(ay, j + size))
        return dx * dx + dy * dy <= radius * radius

    # --- расчёт ---

    def nextKey(self):
        # Следующая ячейка для расчёта, BUSY (много проверок подряд, пора свериться с бюджетом кадра) или None.
        checks = 0
        while True:
            phase = self.__phase
            if phase == _UNIFORM:
                key = self.__nextUniform()
            elif phase == _SWEEP:
                key = self.__nextSweep()
            elif phase == _REFINE:
                key = self.__nextRefine()
            elif phase == _FULL:
                key = self.__nextFull()
            else:
                # Готово, но прицел мог переехать: круг полной проверки открывает новые блоки.
                if self.focusRadius > 0.0 and not self.fullPass and self.__aimChanged:
                    self.__aimChanged = False
                    self.__updateFocus()
                    if self.__heap:
                        self.__phase = _REFINE
                        self.done = False
                        continue
                return None
            if key is BUSY:
                checks += 1
                if checks >= _CHECKS_PER_CALL:
                    return BUSY
                continue
            if key is not None:
                return key

    def store(self, key, value):
        # value — значение ячейки key, которую вернул nextKey().
        self.cache[key] = value

    def __roots(self):
        x0, y0, x1, y1 = self.area
        top = self.topLevel
        size = 1 << top
        return [ (i, j) for j in xrange(y0 >> top << top, y1, size) for i in xrange(x0 >> top << top, x1, size) ]

    def __children(self, i, j, level):
        half = 1 << level - 1
        return ((i, j), (i + half, j), (i, j + half), (i + half, j + half))

    def __nextUniform(self):
        # Корни, затем деление всех блоков уровень за уровнем до base.
        cache = self.cache
        while self.__jobIdx < len(self.__jobs):
            i, j = self.__jobs[self.__jobIdx]
            if self.__isRootStage:
                if (i, j) not in cache:
                    return (i, j)
                self.__setBlock(i, j, self.__level, cache[i, j] if self.__level <= self.minLevel else None)
                self.__created.append((i, j))
                self.__jobIdx += 1
                continue
            level = self.__level + 1
            for child in self.__children(i, j, level)[1:]:
                if child not in cache:
                    return child

            final = level - 1 <= self.minLevel
            for ci, cj in self.__children(i, j, level):
                self.__setBlock(ci, cj, level - 1, cache[ci, cj] if final else None)
                self.__created.append((ci, cj))

            self.splits += 1
            self.__jobIdx += 1

        created = self.__created
        level = self.__level
        self.__created = []
        self.__isRootStage = False
        if level <= self.baseLevel:
            # Равномерная часть готова: блоки base — на проверку однородности.
            self.__phase = _SWEEP
            self.__sweep = created if level > self.minLevel else []
            self.__sweepIdx = 0
            return BUSY
        self.__jobs = created
        self.__jobIdx = 0
        self.__level = level - 1
        return BUSY

    def __nextSweep(self):
        # Блоки base: однородные рисуются сразу, остальные — в очередь уточнения. Расчётов здесь нет.
        if self.__sweepIdx < len(self.__sweep):
            i, j = self.__sweep[self.__sweepIdx]
            self.__sweepIdx += 1
            level = self.baseLevel
            if self.__inFocus(i, j, level) or self.__boundary(i, j, level, False) is not False:
                self.__push(i, j, level, None, False)
            else:
                self.__finalizeUniform(i, j, level)
            return BUSY
        self.__sweep = None
        self.hasPicture = True
        self.__phase = _REFINE
        return BUSY

    def __nextRefine(self):
        if self.__aimChanged:
            self.__aimChanged = False
            self.__updateFocus()
        cache = self.cache
        job = self.__job
        if job is None:
            if not self.__heap:
                self.__phase = _DONE
                self.done = True
                self.hasPicture = True
                return None
            job = self.__job = list(heapq.heappop(self.__heap)[2:])
        i, j, level, inherit, needsCheck = job
        if needsCheck and not self.__inFocus(i, j, level):
            boundary = self.__boundary(i, j, level, True)
            if boundary is False:
                self.__job = None
                self.__finalizeUniform(i, j, level)
                return BUSY
            if boundary is not True:
                # Нужно значение соседа, которого ещё нет.
                return boundary
            job[4] = False
        for child in self.__children(i, j, level)[1:]:
            if child not in cache:
                return child

        child = level - 1
        final = child <= self.minLevel
        for ci, cj in self.__children(i, j, level):
            self.__setBlock(ci, cj, child, cache[ci, cj] if final else inherit)
            if not final:
                self.__push(ci, cj, child, inherit, True)

        self.splits += 1
        self.__job = None
        return BUSY

    def __push(self, i, j, level, inherit, needsCheck):
        self.__seq += 1
        heapq.heappush(self.__heap, (self.__priority(i, j, level), self.__seq, i, j, level, inherit, needsCheck))

    def __updateFocus(self):
        # Прицел сдвинулся: пересортировать очередь и открыть однородные блоки, попавшие в круг полной проверки.
        aim = self.__aim
        heapAim = self.__heapAim
        if (aim[0] - heapAim[0]) ** 2 + (aim[1] - heapAim[1]) ** 2 > _RESORT_DISTANCE ** 2:
            self.__heapAim = aim
            self.__heap = [ (self.__priority(entry[2], entry[3], entry[4]),) + entry[1:] for entry in self.__heap ]
            heapq.heapify(self.__heap)
        radius = self.focusRadius
        if radius <= 0.0:
            return
        focusAim = self.__focusAim
        if focusAim is not None and (aim[0] - focusAim[0]) ** 2 + (aim[1] - focusAim[1]) ** 2 < (radius * 0.5) ** 2:
            return
        self.__focusAim = aim
        reopen = [ (key, level) for key, level in self.__uniform.iteritems() if self.__inFocus(key[0], key[1], level) ]
        for (i, j), level in reopen:
            del self.__uniform[i, j]
            # Блок остаётся на экране своим цветом, пока его части не станут точными.
            self.__push(i, j, level, self.cache[i, j], False)

    def __finalizeUniform(self, i, j, level):
        self.__setBlock(i, j, level, self.cache[i, j])
        if level > self.minLevel:
            self.__uniform[i, j] = level
            if level >= self.minLevel + 2:
                self.__probeBlocks.append(((i, j), level))

    def __neighbourValue(self, x, y, level):
        # Значение соседа уровня level в пикселе (x, y): однородный блок крупнее, посчитанная ячейка, _MISSING
        # (за покрытием) или None вместо ключа, если ячейку надо досчитать: тогда возвращается (None, ключ).
        cx0, cy0, cx1, cy1 = self.__cover
        if x < cx0 or y < cy0 or x >= cx1 or y >= cy1:
            return _MISSING
        # Обычно ячейка соседа того же уровня уже посчитана — это самый точный ответ.
        mask = ~((1 << level) - 1)
        key = (x & mask, y & mask)
        value = self.cache.get(key, _MISSING)
        if value is not _MISSING:
            return value
        uniform = self.__uniform
        for lvl in xrange(level + 1, self.topLevel + 1):
            mask = ~((1 << lvl) - 1)
            coarse = (x & mask, y & mask)
            if uniform.get(coarse) == lvl:
                return self.cache[coarse]

        return (None, key)

    def __boundary(self, i, j, level, canSample):
        # True — у одного из 8 соседей другое значение; False — все известные соседи такие же;
        # ключ — соседа нужно досчитать (только если canSample). Всё, что не рисуется, — одно значение:
        # границу «мимо цели» / UNDEFINED уточнять незачем.
        drawable = self.drawable
        cache = self.cache
        value = cache[i, j]
        value = value if value in drawable else None
        size = 1 << level
        missing = None
        for dx, dy in _NEIGHBOURS:
            # Быстрый путь: соседний блок того же уровня уже посчитан.
            other = cache.get((i + dx * size, j + dy * size), _MISSING)
            if other is _MISSING:
                other = self.__neighbourValue(i + dx * size, j + dy * size, level)
                if other is _MISSING:
                    continue
            if type(other) is tuple and len(other) == 2 and other[0] is None:
                if missing is None:
                    missing = other[1]
                continue
            if (other if other in drawable else None) != value:
                return True

        if missing is not None and canSample:
            return missing
        return False

    def __spiral(self):
        # Ячейки области квадратными кольцами от прицела.
        shift = self.minLevel
        cell = 1 << shift
        x0, y0, x1, y1 = self.area
        iLo, jLo = x0 >> shift, y0 >> shift
        iHi, jHi = x1 - 1 >> shift, y1 - 1 >> shift
        ci = max(iLo, min(iHi, int(self.__aim[0]) >> shift))
        cj = max(jLo, min(jHi, int(self.__aim[1]) >> shift))
        radius = 0
        while True:
            if ci - radius < iLo and ci + radius > iHi and cj - radius < jLo and cj + radius > jHi:
                return
            if radius == 0:
                yield (ci << shift, cj << shift)
            else:
                left, right = ci - radius, ci + radius
                top, bottom = cj - radius, cj + radius
                for row in (top, bottom):
                    if jLo <= row <= jHi:
                        for col in xrange(max(left, iLo), min(right, iHi) + 1):
                            yield (col << shift, row << shift)

                for col in (left, right):
                    if iLo <= col <= iHi:
                        for row in xrange(max(top + 1, jLo), min(bottom - 1, jHi) + 1):
                            yield (col << shift, row << shift)

            radius += 1

    def __nextFull(self):
        pending = self.__pendingCell
        if pending is not None:
            if pending not in self.cache:
                return pending
            self.__setBlock(pending[0], pending[1], self.minLevel, self.cache[pending])
            self.__pendingCell = None
        for key in self.__cells:
            if key in self.cache:
                self.__setBlock(key[0], key[1], self.minLevel, self.cache[key])
                continue
            self.__pendingCell = key
            return key

        self.__phase = _DONE
        self.done = True
        return None

    def valueAt(self, x, y, level):
        # Значение самого мелкого посчитанного блока уровня не ниже level, содержащего пиксель (x, y).
        cache = self.cache
        for lvl in xrange(level, self.topLevel + 1):
            mask = ~((1 << lvl) - 1)
            value = cache.get((x & mask, y & mask), _MISSING)
            if value is not _MISSING:
                return value

        return _MISSING

    def probe(self):
        # Точка для проверки, не изменилась ли картинка: центр случайного однородного блока (не мельче 4 ячеек).
        # Сдвиг сетки на полпикселя при округлении якоря значение в центре не меняет.
        # Возвращает (x, y, ожидаемое значение) или None.
        if not self.__probeBlocks:
            return None
        (i, j), level = random.choice(self.__probeBlocks)
        if self.__uniform.get((i, j)) != level:
            # Блок открыт заново кругом под прицелом — он уже не однородный.
            return None
        half = (1 << level) * 0.5
        return (i + half, j + half, self.cache[i, j])

    @property
    def stage(self):
        # Фаза расчёта для строки статистики.
        if self.__phase == _UNIFORM:
            return 'uniform %dpx' % (1 << self.__level)
        if self.__phase == _REFINE:
            return 'refine, queue %d' % len(self.__heap)
        return self.__phase

    def summary(self):
        # Для строки статистики.
        return 'cell=%dpx search=%dpx stage=%s%s done=%s cells=%d splits=%d' % (1 << self.minLevel,
         1 << self.baseLevel,
         self.stage,
         ' full pass' if self.fullPass else '',
         self.done,
         len(self.cache),
         self.splits)

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
