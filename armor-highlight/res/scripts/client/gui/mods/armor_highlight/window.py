# -*- coding: utf-8 -*-
# Область вокруг центра прицела. Без BigWorld и GUI — тестируется офлайн (tests/test_window.py).
#
# Координаты: ячейка (i, j) — квадрат cellPx x cellPx с левым верхним углом (i * cellPx, j * cellPx) пикселей
# от якоря на цели. Блок уровня k — квадрат 2**k ячеек, его (i, j) кратны 2**k. Значение блока — результат
# в центре его левой верхней ячейки, поэтому блок и его левый верхний потомок делят один расчёт.
#
# Круг радиуса radius px вокруг центра прицела. Основа — блоки уровня level: если ячеек в круге больше maxCells,
# основа крупнее ячейки из настроек.
# Порядок расчёта (как в 0.3.0):
#   1. Непосчитанные блоки области — от уровня level + coarseLevels к основе, в каждом уровне от центра. Круг сразу
#      закрашен грубо: пока блок не посчитан, рисуется значение ближайшего посчитанного крупного блока над ним —
#      только если тот внутри силуэта (все его соседи тоже на цели), иначе цвет вылился бы за контур танка.
#   2. Круг пересчёта, снова и снова: сначала уточнение, затем каждый блок основы. Блок, у которого хоть один из
#      8 соседей того же уровня показывает другое (другой цвет или край силуэта), делится на 4 — и так до ячейки
#      из настроек. Однородная броня остаётся крупными блоками и расчёта не тратит; граница, пропавшая при
#      повороте цели, снова становится одним блоком. Основа пересчитывается сначала на границах (край силуэта,
#      смена цвета), потом однородная. Новый круг начинается не чаще раза за кадр.
# Область расчёта чуть шире круга и квантована, чтобы порядок не перестраивался каждый кадр.
# Посчитанное хранится, пока сетка жива: прицел ушёл и вернулся — картинка сразу на месте.
#
# Растр: у каждой полосы (строки блоков основы области расчёта) — интервалы по строкам ячеек; у поделённых блоков
# свои строки по их листьям. Куски по _CHUNK_ROWS строк: одинаковые интервалы соседних строк — один прямоугольник;
# куски кэшируются и пересобираются, только когда меняются их полосы. Затем прямоугольники обрезаются по кругу —
# точно по горизонтали, полосками высотой edgePx по вертикали; целиком лежащие в круге не трогаются.
import math
import sys
import time

from gui.mods.armor_highlight.lattice import BUSY

MAX_LEVEL = 8
_MISSING = object()
# Столько проверок границ подряд — и nextKey() отдаёт BUSY, чтобы свериться с бюджетом кадра.
_CHECKS_PER_CALL = 64
# Новые значения попадают в картинку не чаще раза в столько кадров (квадраты всё равно едут за целью каждый кадр,
# а сдвиг самого круга за прицелом — сразу) и не больше чем по столько полос за раз: сборка на 1 px — миллисекунды.
_RECTS_EVERY_FRAMES = 2
# Время на пересборку полос за раз, с; остальные — в следующий раз, пока показываются прежними.
_REBUILD_SECONDS = 0.0015
_CHUNK_ROWS = 16
_timer = time.clock if sys.platform == 'win32' else time.time
_NEIGHBOURS = ((-1, 0), (1, 0), (0, -1), (0, 1), (1, 1), (-1, -1), (1, -1), (-1, 1))


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
    # (порядок, пересчёт): порядок — блоки уровней от topLevel до level, в каждом от центра (с повторами:
    # крупный блок есть и в мелких уровнях); пересчёт — блоки уровня level от центра.
    # Крупные уровни — с кольцом блоков вокруг: у крупного блока, чьё значение подставляется, должны быть
    # посчитаны все соседи (иначе неизвестно, не у края ли он силуэта).
    order = []
    refresh = []
    for lvl in xrange(topLevel, level - 1, -1):
        step = 1 << lvl
        half = step * 0.5
        ring = step * 1.5 if lvl > level else 0.0
        cells = [ (i, j) for j, iLo, iHi in rowRanges(u, v, radius + ring, step) for i in xrange(iLo, iHi + 1, step) ]
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
        # Расчётов уточнения в последнем законченном круге.
        self.lastDetail = 0
        self.__detail = 0
        # Поделённые блоки (i, j, уровень), уровень от 1 до level.
        self.__split = set()
        self.__aim = aim
        self.__computeKey = None
        # Порядок расчёта для центра, сдвинутого на кратное шагу верхнего уровня, — тот же, только сдвинутый:
        # (u mod M, v mod M, r) -> (порядок, число блоков пересчёта).
        self.__patterns = {}
        self.__order = []
        self.__orderPos = 0
        self.__refresh = []
        self.__cycle = None
        self.__cycleStarted = False
        # Область меняется — номер растёт; «готово» — когда закончен круг, начатый уже для этой области.
        self.__epoch = 0
        self.__cycleEpoch = 0
        self.__drawRows = ()
        # Строки блоков области расчёта: j -> (iLo, iHi). Полосы: j -> (iLo, iHi, строки), строки поделённых блоков
        # основы: (i, j) -> строки. Куски: номер -> (подпись полос, прямоугольники без обрезки).
        self.__areaRows = {}
        self.__bandKey = None
        self.__bands = {}
        self.__dirtyBands = set()
        self.__localRows = {}
        self.__chunks = {}
        self.__clipCenter = None
        self.__framesSinceRects = _RECTS_EVERY_FRAMES
        # Круг сдвинулся: пересобрать сразу, без ожидания.
        self.__geometryDirty = True
        self.__rects = []
        self.__rectsDirty = True
        self.setAim(aim)

    # --- прицел ---

    def setAim(self, aim):
        # Вызывается каждый кадр: круг для рисования, область расчёта, новый круг пересчёта разрешён.
        self.__aim = aim
        self.__cycleStarted = False
        self.__framesSinceRects += 1
        cell = float(self.cellPx)
        u = aim[0] / cell
        v = aim[1] / cell
        radius = self.radius / cell
        step = 1 << self.level
        # Строки блоков, задевающих круг: запас — шаг и полоска края (край режется по центру полоски, её крайние
        # строки шире своей окружности). Лишнее отрежет край круга.
        group = max(1, self.edgePx // self.cellPx)
        drawRows = rowRanges(u, v, radius + step + group, step)
        if drawRows != self.__drawRows:
            self.__drawRows = drawRows
            self.__geometryDirty = True
        quant = 2 * step
        qu = int(round(u / quant)) * quant
        qv = int(round(v / quant)) * quant
        # Область расчёта покрывает круг пересчёта (круг рисования и кольцо блоков вокруг) при любом сдвиге
        # квантованного центра.
        qr = (int(math.ceil((radius + group + 3 * step) / quant)) + 1) * quant
        computeKey = (qu, qv, qr)
        if computeKey != self.__computeKey:
            self.__computeKey = computeKey
            period = 1 << self.topLevel
            bu = qu % period
            bv = qv % period
            pattern = self.__patterns.get((bu, bv, qr))
            if pattern is None:
                pattern = self.__patterns[bu, bv, qr] = refineOrder(bu, bv, qr, self.level, self.topLevel)
            order, refresh = pattern
            du = qu - bu
            dv = qv - bv
            if du or dv:
                order = [ (i + du, j + dv) for i, j in order ]
                refresh = [ (i + du, j + dv) for i, j in refresh ]
            self.__order = order
            self.__refresh = refresh
        # Границы полос растра — по области, квантованной крупнее (8 шагов): при движении прицела полосы
        # пересобираются целиком редко, а не каждые 2 шага.
        bandQuant = 8 * step
        bu = int(round(u / bandQuant)) * bandQuant
        bv = int(round(v / bandQuant)) * bandQuant
        br = (int(math.ceil((radius + group + 3 * step) / bandQuant)) + 1) * bandQuant
        bandKey = (bu, bv, br)
        if bandKey != self.__bandKey:
            self.__bandKey = bandKey
            self.__areaRows = dict(((j, (iLo, iHi)) for j, iLo, iHi in rowRanges(bu, bv, br, step)))
            self.__geometryDirty = True
            self.__orderPos = 0
            self.__epoch += 1
            self.done = False

    @property
    def aim(self):
        return self.__aim

    @property
    def stepPx(self):
        # Сторона блока основы на экране: при большом круге она больше ячейки из настроек.
        return self.cellPx << self.level

    @property
    def splitCount(self):
        return len(self.__split)

    # --- расчёт ---

    def nextKey(self):
        # Ключ для расчёта, BUSY (много проверок подряд — пора свериться с бюджетом) или None (на этот кадр всё).
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
        while True:
            if self.__cycle is None:
                if self.__cycleStarted:
                    return None
                self.__cycleStarted = True
                self.__detail = 0
                self.__cycleEpoch = self.__epoch
                self.__cycle = self.__runCycle()
            key = next(self.__cycle, None)
            if key is not None:
                return key
            self.__cycle = None
            self.cycles += 1
            self.lastDetail = self.__detail
            self.done = self.__cycleEpoch == self.__epoch

    def __runCycle(self):
        # Круг пересчёта: уточнение по уровням от центра, затем основа — блоки рисования и кольцо блоков вокруг
        # (соседи крайних блоков: их устаревшие значения держали бы ложные границы).
        for key in self.__refine():
            yield key

        cell = float(self.cellPx)
        step = 1 << self.level
        group = max(1, self.edgePx // self.cellPx)
        u = self.__aim[0] / cell
        v = self.__aim[1] / cell
        # Кольцо: диагональный сосед крайнего блока рисования — дальше чем на шаг по радиусу.
        blocks = [ (i, j) for j, iLo, iHi in rowRanges(u, v, self.radius / cell + group + 3 * step, step) for i in xrange(iLo, iHi + 1, step) ]
        half = step * 0.5
        blocks.sort(key=lambda key: (key[0] + half - u) ** 2 + (key[1] + half - v) ** 2)
        yield BUSY
        # Сначала блоки на границах (край силуэта, смена цвета) — после поворота цели контур обновляется первым,
        # и подсветка за ним не задерживается; однородные — потом.
        level = self.level
        later = []
        checks = 0
        for key in blocks:
            checks += 1
            if checks >= _CHECKS_PER_CALL:
                checks = 0
                yield BUSY
            if self.__isBoundary(key[0], key[1], level):
                yield key
            else:
                later.append(key)

        for key in later:
            yield key

    def __refine(self):
        level = self.level
        if level < 1:
            return
        ax, ay = self.__aim
        u = ax / float(self.cellPx)
        v = ay / float(self.cellPx)
        step = 1 << level
        # Блоки основы от центра; потомки идут в порядке родителей, то есть тоже от центра.
        candidates = [ (i, j) for j, iLo, iHi in self.__drawRows for i in xrange(iLo, iHi + 1, step) ]
        half = step * 0.5
        candidates.sort(key=lambda key: (key[0] + half - u) ** 2 + (key[1] + half - v) ** 2)
        yield BUSY
        split = self.__split
        checks = 0
        while level >= 1 and candidates:
            half = 1 << level - 1
            deeper = []
            for i, j in candidates:
                checks += 1
                if checks >= _CHECKS_PER_CALL:
                    checks = 0
                    yield BUSY
                if self.__isBoundary(i, j, level):
                    children = ((i + half, j), (i, j + half), (i + half, j + half))
                    for child in children:
                        self.__detail += 1
                        yield child

                    if (i, j, level) not in split:
                        split.add((i, j, level))
                        self.__blockChanged(i, j)
                    deeper.append((i, j))
                    deeper.extend(children)
                elif (i, j, level) in split:
                    self.__unsplit(i, j, level)

            candidates = deeper
            level -= 1

    def __valueAt(self, i, j, level):
        # Показанное значение блока уровня level с углом (i, j): его расчёт или ближайшего крупного блока над ним.
        get = self.cache.get
        for lvl in xrange(level, self.topLevel + 1):
            mask = ~((1 << lvl) - 1)
            value = get((i & mask, j & mask), _MISSING)
            if value is not _MISSING:
                return value

        return _MISSING

    def __isBoundary(self, i, j, level):
        # Отличается ли от блока хоть один из 8 соседей того же уровня. Всё, что не рисуется (мимо цели, нет
        # данных), — одно значение: край силуэта — тоже граница.
        drawable = self.drawable
        value = self.__valueAt(i, j, level)
        if value is _MISSING:
            return False
        value = value if value in drawable else None
        size = 1 << level
        for dx, dy in _NEIGHBOURS:
            other = self.__valueAt(i + dx * size, j + dy * size, level)
            if other is _MISSING:
                continue
            if (other if other in drawable else None) != value:
                return True

        return False

    def __unsplit(self, i, j, level):
        # Блок снова однородный: убрать деление и расчёты потомков, кроме общего с блоком.
        self.__split.discard((i, j, level))
        half = 1 << level - 1
        cache = self.cache
        for ci, cj in ((i, j), (i + half, j), (i, j + half), (i + half, j + half)):
            if level > 1 and (ci, cj, level - 1) in self.__split:
                self.__unsplit(ci, cj, level - 1)
            if ci != i or cj != j:
                cache.pop((ci, cj), None)

        self.__blockChanged(i, j)

    def __blockChanged(self, i, j):
        mask = ~((1 << self.level) - 1)
        bi = i & mask
        bj = j & mask
        self.__localRows.pop((bi, bj), None)
        self.__dirtyBands.add(bj)
        self.__rectsDirty = True

    def store(self, key, value):
        # value — значение ключа key, который вернул nextKey().
        cache = self.cache
        old = cache.get(key, _MISSING)
        cache[key] = value
        if old is not _MISSING and old == value:
            return
        i, j = key
        self.__blockChanged(i, j)
        top = keyLevel(i, j, self.topLevel)
        if top > self.level:
            # Крупный блок подменяет ещё не посчитанные блоки основы под собой: полосы j .. j + 2**top - 1.
            self.__dirtyBands.update(xrange(j, j + (1 << top), 1 << self.level))

    def probe(self):
        # Перепроверки, как в lattice.py, не нужны: круг и так пересчитывается непрерывно.
        return None

    def summary(self):
        # Для строки статистики.
        pending = sum((1 for key in self.__refresh if key not in self.cache))
        cells = sum((len(xrange(iLo, iHi + 1, 1 << self.level)) for _, iLo, iHi in self.__drawRows))
        return 'cell=%dpx step=%d aim area r=%dpx cells=%d split=%d detail/cycle=%d pending=%d cycles=%d' % (self.cellPx,
         1 << self.level,
         self.radius,
         cells,
         len(self.__split),
         self.lastDetail,
         pending,
         self.cycles)

    # --- растр ---

    def __fallback(self, i, j):
        # Пока блок не посчитан, показываем значение ближайшего посчитанного крупного блока над ним — но только
        # внутри силуэта: если у крупного блока хоть один сосед «мимо цели», блок лежит на краю танка, и его цвет
        # вылился бы за контур; тогда до расчёта здесь пусто. Если соседи на этом уровне ещё не посчитаны (точка
        # блока — общая с крупным блоком), проверяется уровень крупнее.
        get = self.cache.get
        drawable = self.drawable
        level = self.level
        for lvl in xrange(level + 1, self.topLevel + 1):
            mask = ~((1 << lvl) - 1)
            pi = i & mask
            pj = j & mask
            value = get((pi, pj), _MISSING)
            if value is _MISSING:
                continue
            if value not in drawable:
                return None
            size = 1 << lvl
            known = True
            for dx, dy in _NEIGHBOURS:
                other = get((pi + dx * size, pj + dy * size), _MISSING)
                if other is _MISSING:
                    known = False
                elif other not in drawable:
                    return None

            if known:
                return value

        return None

    def __buildLocal(self, bi, bj):
        # Строки поделённого блока основы по его листьям: кортеж на строку ячеек, интервалы (значение, i0, i1).
        step = 1 << self.level
        drawable = self.drawable
        split = self.__split
        grid = [ [None] * step for _ in xrange(step) ]
        stack = [(bi, bj, self.level)]
        while stack:
            i, j, level = stack.pop()
            if level >= 1 and (i, j, level) in split:
                half = 1 << level - 1
                stack.extend(((i, j, level - 1), (i + half, j, level - 1), (i, j + half, level - 1), (i + half, j + half, level - 1)))
                continue
            value = self.__valueAt(i, j, level)
            value = value if value in drawable else None
            size = 1 << level
            x0 = i - bi
            for r in xrange(j - bj, j - bj + size):
                grid[r][x0:x0 + size] = [value] * size

        rows = []
        for line in grid:
            row = []
            start = 0
            value = line[0]
            for c in xrange(1, step):
                other = line[c]
                if other != value:
                    if value is not None:
                        row.append((value, bi + start, bi + c))
                    value = other
                    start = c

            if value is not None:
                row.append((value, bi + start, bi + step))
            rows.append(tuple(row))

        return rows

    def __buildBand(self, j, iLo, iHi):
        # Строки полосы блоков основы j: интервалы (значение, x0, x1) в пикселях, блоки подряд; у поделённых —
        # их собственные строки.
        step = 1 << self.level
        get = self.cache.get
        drawable = self.drawable
        split = self.__split
        level = self.level
        # Куски полосы: (False, слитые интервалы однородных блоков подряд) или (True, строки поделённого блока).
        items = []
        uniform = []
        for i in xrange(iLo, iHi + 1, step):
            if level >= 1 and (i, j, level) in split:
                local = self.__localRows.get((i, j))
                if local is None:
                    local = self.__localRows[i, j] = self.__buildLocal(i, j)
                if uniform:
                    items.append((False, uniform))
                    uniform = []
                items.append((True, local))
                continue
            value = get((i, j), _MISSING)
            if value is _MISSING:
                value = self.__fallback(i, j)
            if value not in drawable:
                continue
            if uniform and uniform[-1][0] == value and uniform[-1][2] == i:
                uniform[-1] = (value, uniform[-1][1], i + step)
            else:
                uniform.append((value, i, i + step))

        if uniform:
            items.append((False, uniform))
        cell = self.cellPx
        if len(items) <= 1 and not (items and items[0][0]):
            row = tuple(((v, a * cell, b * cell) for v, a, b in items[0][1])) if items else ()
            return [row] * step
        rows = []
        for r in xrange(step):
            row = []
            for isLocal, data in items:
                for run in (data[r] if isLocal else data):
                    if row and row[-1][0] == run[0] and row[-1][2] == run[1]:
                        row[-1] = (run[0], row[-1][1], run[2])
                    else:
                        row.append(run)

            rows.append(tuple(((v, a * cell, b * cell) for v, a, b in row)))

        return rows

    def rects(self):
        # [(value, x0, y0, x1, y1)] в пикселях от якоря и признак, что список изменился с прошлого вызова.
        # Центр круга для обрезки — прицел с точностью 2 px: иначе картинка пересобиралась бы каждый кадр.
        ax, ay = self.__aim
        center = (int(math.floor(ax * 0.5 + 0.5)) * 2, int(math.floor(ay * 0.5 + 0.5)) * 2)
        if center != self.__clipCenter:
            self.__clipCenter = center
            self.__geometryDirty = True
        if not self.__geometryDirty and (not self.__rectsDirty or self.__framesSinceRects < _RECTS_EVERY_FRAMES):
            return (self.__rects, False)
        self.__framesSinceRects = 0
        self.__geometryDirty = False
        self.__rectsDirty = False
        cx, cy = center
        cell = self.cellPx
        step = 1 << self.level
        chunkRows = max(_CHUNK_ROWS, step)
        radius = self.radius
        # Видимые строки ячеек и полосы в них.
        rowLo = int(math.floor((cy - radius) / cell)) - 1
        rowHi = int(math.ceil((cy + radius) / cell)) + 1
        areaRows = self.__areaRows
        bands = self.__bands
        # 1. Устаревшие полосы: сначала ближние к прицелу, пока хватает времени; остальные — в следующий раз.
        dirtyChunks = set()
        if self.__dirtyBands:
            start = _timer()
            order = sorted(self.__dirtyBands, key=lambda j: abs((j + step * 0.5) * cell - cy))
            for j in order:
                visible = j in areaRows and j + step > rowLo and j <= rowHi
                if not visible:
                    bands.pop(j, None)
                    self.__dirtyBands.discard(j)
                    dirtyChunks.add(j // chunkRows)
                    continue
                if j in bands and _timer() - start > _REBUILD_SECONDS:
                    self.__rectsDirty = True
                    continue
                iLo, iHi = areaRows[j]
                bands[j] = (iLo, iHi, self.__buildBand(j, iLo, iHi))
                self.__dirtyBands.discard(j)
                dirtyChunks.add(j // chunkRows)

        # 2. Куски без обрезки: пересобираются, если изменились их полосы или границы области.
        chunks = self.__chunks
        found = []
        for chunk in xrange(rowLo // chunkRows, rowHi // chunkRows + 1):
            j0 = chunk * chunkRows
            signature = tuple(((j, areaRows[j]) for j in xrange(j0, j0 + chunkRows, step) if j in areaRows))
            entry = chunks.get(chunk)
            if entry is None or chunk in dirtyChunks or entry[0] != signature:
                entry = chunks[chunk] = (signature, self.__buildChunk(signature))
            found.extend(entry[1])

        # 3. Обрезка по кругу: полоски высотой edgePx, край — по центру полоски.
        group = max(1, self.edgePx // cell)
        r2 = radius * radius
        clips = {}

        def clipOf(g):
            clip = clips.get(g)
            if clip is None:
                dy = (g + 0.5) * group * cell - cy
                rest = r2 - dy * dy
                if rest <= 0.0:
                    clip = (cx, cx)
                else:
                    width = math.sqrt(rest)
                    clip = (int(math.floor(cx - width + 0.5)), int(math.floor(cx + width + 0.5)))
                clips[g] = clip
            return clip

        rects = []
        for value, x0, r0, x1, r1 in found:
            g0 = r0 // group
            g1 = (r1 - 1) // group
            top = clipOf(g0)
            bottom = clipOf(g1)
            # Круг выпуклый: самая узкая строка прямоугольника — верхняя или нижняя.
            if top[0] <= x0 and x1 <= top[1] and bottom[0] <= x0 and x1 <= bottom[1]:
                rects.append((value, x0, r0 * cell, x1, r1 * cell))
                continue
            last = None
            for g in xrange(g0, g1 + 1):
                xl, xr = clipOf(g)
                a = x0 if x0 > xl else xl
                b = x1 if x1 < xr else xr
                if a >= b:
                    last = None
                    continue
                y0 = max(r0, g * group) * cell
                y1 = min(r1, (g + 1) * group) * cell
                if last is not None and last[1] == a and last[3] == b and last[4] == y0:
                    last[4] = y1
                else:
                    last = [value, a, y0, b, y1]
                    rects.append(last)

        rects = [ tuple(rect) for rect in rects ]
        if rects == self.__rects:
            return (self.__rects, False)
        self.__rects = rects
        return (rects, True)

    def __buildChunk(self, signature):
        # Прямоугольники куска без обрезки: (значение, x0, строка0, x1, строка1), x в пикселях, строки — в ячейках.
        bands = self.__bands
        rects = []
        opened = {}
        lastRow = None
        for j, (iLo, iHi) in signature:
            entry = bands.get(j)
            if entry is None or entry[0] != iLo or entry[1] != iHi:
                entry = bands[j] = (iLo, iHi, self.__buildBand(j, iLo, iHi))
            row = j
            for runs in entry[2]:
                if lastRow is None or row != lastRow + 1:
                    opened = {}
                current = {}
                for piece in runs:
                    idx = opened.get(piece)
                    if idx is None:
                        idx = len(rects)
                        rects.append([piece[0], piece[1], row, piece[2], row + 1])
                    else:
                        rects[idx][4] = row + 1
                    current[piece] = idx

                opened = current
                lastRow = row
                row += 1

        return [ tuple(rect) for rect in rects ]
