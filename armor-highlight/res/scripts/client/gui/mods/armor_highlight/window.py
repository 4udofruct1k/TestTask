# -*- coding: utf-8 -*-
# Область вокруг центра прицела: каждая ячейка в круге радиуса radius px, от центра наружу.
# Без BigWorld и GUI — тестируется офлайн (tests/test_window.py).
#
# Координаты — пиксели экрана от якоря на цели, как в lattice.py: ячейка (i, j) — квадрат 2**minLevel px
# с левым верхним углом (i, j), значение — результат в центре её левого верхнего пикселя.
# Ячейки собраны в плитки 8x8 px (при ячейке крупнее — плитка из одной ячейки). Область — плитки, чей центр
# не дальше radius от прицела, в пределах габаритов цели. Плитки считаются по близости к прицелу, в плитке —
# все ячейки подряд. Посчитанное хранится по плиткам: прицел ушёл и вернулся — картинка сразу на месте.
#
# refresh(): цель на экране сдвинулась (башня, угол камеры, дистанция). Область пересчитывается заново от центра.
# Прежние значения остаются на экране, только пока суммарный сдвиг с их расчёта не больше staleDriftPx, дальше
# плитка показывает лишь пересчитанное: неактуальная картинка не показывается. На движущейся цели видна та часть
# круга, которую расчёт успевает держать актуальной, — центр всегда.
#
# Растр: у каждой плитки свои интервалы одного значения по строкам; строка области — интервалы её плиток подряд,
# соседние одного значения сливаются; одинаковые интервалы соседних строк — в прямоугольники. Каждый
# прямоугольник — квадрат на экране, поэтому их должно быть как можно меньше: при разрезе по плиткам
# их выходило втрое больше.
import math

_TILE_MIN_SHIFT = 3
# Круг перестраивается, когда прицел сдвинулся на столько пикселей: плитка 8 px, чаще незачем.
_WINDOW_STEP_PX = 4.0
_MISSING = object()


class _Tile(object):
    __slots__ = ('key', 'values', 'old', 'oldStamp', 'complete', 'cells', 'runs')

    def __init__(self, key):
        self.key = key
        # Значения текущего пересчёта и прежние (показываются, пока ячейка не пересчитана).
        self.values = {}
        self.old = None
        # Суммарный сдвиг цели на момент расчёта самых старых из прежних значений.
        self.oldStamp = 0.0
        self.complete = False
        self.cells = None
        # Интервалы по строкам плитки или None, если значения менялись.
        self.runs = None


class AimWindow(object):

    def __init__(self, area, minLevel, drawable, aim, radius, staleDriftPx=2.0):
        # area: (x0, y0, x1, y1) — габариты цели в пикселях от якоря; aim — центр прицела от якоря.
        self.area = area
        self.minLevel = minLevel
        self.tileShift = max(_TILE_MIN_SHIFT, minLevel)
        self.drawable = frozenset(drawable)
        self.radius = float(radius)
        self.done = False
        self.hasPicture = True
        self.stale = False
        self.refreshes = 0
        self.staleDriftPx = staleDriftPx
        # Суммарный сдвиг цели на экране с создания, px, и его значение в начале текущего пересчёта.
        self.driftTotal = 0.0
        self.__passStamp = 0.0
        self.__aim = aim
        self.__windowAim = None
        self.__tiles = {}
        self.__window = frozenset()
        self.__todo = []
        self.__current = None
        # Полосы плиток: y плитки -> x плиток области по порядку; строки полос с интервалами.
        self.__bands = {}
        self.__bandRows = {}
        self.__dirtyBands = set()
        self.__rects = []
        self.__rectsDirty = True
        self.__updateWindow()

    # --- прицел ---

    def setAim(self, aim):
        self.__aim = aim
        last = self.__windowAim
        if abs(aim[0] - last[0]) >= _WINDOW_STEP_PX or abs(aim[1] - last[1]) >= _WINDOW_STEP_PX:
            self.__updateWindow()

    @property
    def aim(self):
        return self.__aim

    def __updateWindow(self):
        # Плитки области для текущего прицела и очередь расчёта.
        ax, ay = self.__windowAim = self.__aim
        shift = self.tileShift
        size = 1 << shift
        half = size * 0.5
        radius = self.radius
        r2 = radius * radius
        x0, y0, x1, y1 = self.area
        aimTile = (int(math.floor(ax)) >> shift << shift, int(math.floor(ay)) >> shift << shift)
        window = []
        for ky in xrange(int(math.floor((ay - radius) / size)) - 1, int(math.floor((ay + radius) / size)) + 2):
            ty = ky << shift
            if ty >= y1 or ty + size <= y0:
                continue
            dy = ty + half - ay
            for kx in xrange(int(math.floor((ax - radius) / size)) - 1, int(math.floor((ax + radius) / size)) + 2):
                tx = kx << shift
                if tx >= x1 or tx + size <= x0:
                    continue
                dx = tx + half - ax
                if dx * dx + dy * dy <= r2 or (tx, ty) == aimTile:
                    window.append((tx, ty))

        window = frozenset(window)
        if window != self.__window:
            self.__window = window
            self.__rectsDirty = True
            bands = {}
            for key in window:
                bands.setdefault(key[1], []).append(key[0])

            bands = dict(((ty, tuple(sorted(xs))) for ty, xs in bands.iteritems()))
            old = self.__bands
            self.__dirtyBands.update((ty for ty in set(old) | set(bands) if old.get(ty) != bands.get(ty)))
            self.__bands = bands
        tiles = self.__tiles
        todo = []
        for key in window:
            tile = tiles.get(key)
            if tile is None:
                tile = tiles[key] = _Tile(key)
            if not tile.complete:
                # Сначала плитки, где ещё ничего нет, потом пересчёт прежних; в каждой группе — от прицела.
                hasPicture = bool(tile.values) or tile.old is not None
                todo.append((hasPicture, (key[0] + half - ax) ** 2 + (key[1] + half - ay) ** 2, key))

        todo.sort(reverse=True)
        self.__todo = todo
        self.__current = None
        self.done = False

    # --- расчёт ---

    def nextKey(self):
        # Следующая ячейка для расчёта или None, если вся область посчитана.
        tiles = self.__tiles
        while True:
            current = self.__current
            if current is None:
                if not self.__todo:
                    self.done = True
                    return None
                key = self.__todo.pop()[2]
                tile = tiles.get(key)
                if tile is None or tile.complete:
                    continue
                if tile.cells is None:
                    tile.cells = self.__cells(key)
                current = self.__current = [tile, 0]
            tile, idx = current
            cells = tile.cells
            values = tile.values
            count = len(cells)
            while idx < count and cells[idx] in values:
                idx += 1

            if idx < count:
                current[1] = idx
                return cells[idx]
            tile.complete = True
            if tile.old is not None:
                tile.old = None
                self.__tileChanged(tile)
            self.__current = None

    def store(self, key, value):
        # value — значение ячейки key, которую вернул nextKey().
        shift = self.tileShift
        tile = self.__tiles.get((key[0] >> shift << shift, key[1] >> shift << shift))
        if tile is None:
            return
        tile.values[key] = value
        self.__tileChanged(tile)

    def __tileChanged(self, tile):
        tile.runs = None
        self.__dirtyBands.add(tile.key[1])
        self.__rectsDirty = True

    def refresh(self, area, drift):
        # Цель на экране сдвинулась на drift px: пересчёт заново от центра, устаревшее убирается.
        self.driftTotal += drift
        self.refreshes += 1
        self.area = area
        window = self.__window
        tiles = self.__tiles
        for key in tiles.keys():
            if key not in window:
                del tiles[key]

        now = self.driftTotal
        passStamp = self.__passStamp
        for tile in tiles.itervalues():
            changed = False
            if tile.values:
                if tile.old is None:
                    tile.old = tile.values
                    tile.oldStamp = passStamp
                else:
                    tile.old.update(tile.values)
                    tile.oldStamp = min(tile.oldStamp, passStamp)
                tile.values = {}
            if tile.old is not None and now - tile.oldStamp > self.staleDriftPx:
                tile.old = None
                changed = True
            tile.complete = False
            tile.cells = None
            if changed:
                self.__tileChanged(tile)

        self.__passStamp = now
        self.__updateWindow()

    def __cells(self, key):
        # Ячейки плитки внутри габаритов цели, по строкам.
        tx, ty = key
        step = 1 << self.minLevel
        size = 1 << self.tileShift
        x0, y0, x1, y1 = self.area
        xs = [ x for x in xrange(tx, tx + size, step) if x + step > x0 and x < x1 ]
        return [ (x, y) for y in xrange(ty, ty + size, step) if y + step > y0 and y < y1 for x in xs ]

    def probe(self):
        # Перепроверки однородных блоков, как в lattice.py, здесь нет: область пересчитывается целиком при сдвиге.
        return None

    def valueAt(self, x, y):
        # Значение ячейки с пикселем (x, y): текущее, прежнее или _MISSING.
        mask = ~((1 << self.minLevel) - 1)
        key = (x & mask, y & mask)
        shift = self.tileShift
        tile = self.__tiles.get((key[0] >> shift << shift, key[1] >> shift << shift))
        if tile is None:
            return _MISSING
        value = tile.values.get(key, _MISSING)
        if value is _MISSING and tile.old is not None:
            value = tile.old.get(key, _MISSING)
        return value

    def summary(self):
        # Для строки статистики.
        window = self.__window
        tiles = self.__tiles
        complete = sum((1 for key in window if tiles[key].complete))
        return 'cell=%dpx aim area r=%dpx tiles=%d/%d refreshes=%d done=%s' % (1 << self.minLevel,
         self.radius,
         complete,
         len(window),
         self.refreshes,
         self.done)

    # --- растр ---

    def __tileRuns(self, tile):
        # Интервалы одного значения в каждой строке плитки: кортеж на строку, (x0, x1, значение).
        values = tile.values
        old = tile.old or {}
        drawable = self.drawable
        step = 1 << self.minLevel
        size = 1 << self.tileShift
        tx, ty = tile.key
        x0, y0, x1, y1 = self.area
        xs = [ x for x in xrange(tx, tx + size, step) if x + step > x0 and x < x1 ]
        rows = []
        for y in xrange(ty, ty + size, step):
            if y + step <= y0 or y >= y1:
                rows.append(())
                continue
            runs = []
            start = end = value = None
            for x in xs:
                cell = values.get((x, y), _MISSING)
                if cell is _MISSING:
                    cell = old.get((x, y))
                if cell not in drawable:
                    cell = None
                if cell == value and x == end:
                    end = x + step
                    continue
                if value is not None:
                    runs.append((start, end, value))
                start, end, value = x, x + step, cell

            if value is not None:
                runs.append((start, end, value))
            rows.append(tuple(runs))

        return rows

    def __buildBand(self, ty, xs):
        # Строки полосы: интервалы плиток подряд, стыкующиеся интервалы одного значения сливаются.
        tiles = self.__tiles
        rows = [ [] for _ in xrange((1 << self.tileShift) >> self.minLevel) ]
        for tx in xs:
            tile = tiles[tx, ty]
            if tile.runs is None:
                tile.runs = self.__tileRuns(tile)
            for row, runs in zip(rows, tile.runs):
                for run in runs:
                    if row and row[-1][1] == run[0] and row[-1][2] == run[2]:
                        row[-1] = (row[-1][0], run[1], run[2])
                    else:
                        row.append(run)

        return [ tuple(row) for row in rows ]

    def rects(self):
        # [(value, x0, y0, x1, y1)] в пикселях от якоря и признак, что список изменился с прошлого вызова.
        if not self.__rectsDirty:
            return (self.__rects, False)
        self.__rectsDirty = False
        bands = self.__bands
        bandRows = self.__bandRows
        for ty in self.__dirtyBands:
            xs = bands.get(ty)
            if xs:
                bandRows[ty] = self.__buildBand(ty, xs)
            else:
                bandRows.pop(ty, None)

        self.__dirtyBands.clear()
        step = 1 << self.minLevel
        rects = []
        opened = {}
        lastY = None
        for ty in sorted(bandRows):
            y = ty
            for runs in bandRows[ty]:
                if lastY is None or y != lastY + step:
                    opened = {}
                current = {}
                for run in runs:
                    idx = opened.get(run)
                    if idx is None:
                        idx = len(rects)
                        rects.append([run[2], run[0], y, run[1], y + step])
                    else:
                        rects[idx][4] = y + step
                    current[run] = idx

                opened = current
                lastY = y
                y += step

        rects = [ tuple(rect) for rect in rects ]
        if rects == self.__rects:
            return (self.__rects, False)
        self.__rects = rects
        return (rects, True)
