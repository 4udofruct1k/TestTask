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
# refresh(): цель на экране чуть сдвинулась (башня, угол камеры, дистанция). Картинка не пропадает: прежние
# значения остаются на экране, а область пересчитывается заново от центра наружу. Если цель сдвинулась ещё раз,
# пока пересчёт идёт, он всё равно доходит до края области, и только потом начинается следующий.
import math

_TILE_MIN_SHIFT = 3
_MISSING = object()


class _Tile(object):
    __slots__ = ('key', 'values', 'old', 'complete', 'cells', 'rects')

    def __init__(self, key):
        self.key = key
        # Значения текущего пересчёта и прежние (показываются, пока ячейка не пересчитана).
        self.values = {}
        self.old = None
        self.complete = False
        self.cells = None
        self.rects = None


class AimWindow(object):

    def __init__(self, area, minLevel, drawable, aim, radius):
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
        self.__aim = aim
        self.__windowAim = None
        self.__tiles = {}
        self.__window = frozenset()
        self.__todo = []
        self.__current = None
        self.__again = False
        self.__nextArea = None
        self.__rects = []
        self.__rectsDirty = True
        self.__updateWindow()

    # --- прицел ---

    def setAim(self, aim):
        self.__aim = aim
        last = self.__windowAim
        if abs(aim[0] - last[0]) >= 1.0 or abs(aim[1] - last[1]) >= 1.0:
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
                    if self.__again:
                        self.__startRefresh()
                        continue
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
                tile.rects = None
                self.__rectsDirty = True
            self.__current = None

    def store(self, key, value):
        # value — значение ячейки key, которую вернул nextKey().
        shift = self.tileShift
        tile = self.__tiles.get((key[0] >> shift << shift, key[1] >> shift << shift))
        if tile is None:
            return
        tile.values[key] = value
        tile.rects = None
        self.__rectsDirty = True

    def refresh(self, area):
        # Цель на экране сдвинулась: пересчитать область, не убирая картинку.
        self.__nextArea = area
        if self.done:
            self.__startRefresh()
        else:
            self.__again = True

    def __startRefresh(self):
        self.__again = False
        self.refreshes += 1
        if self.__nextArea is not None:
            self.area = self.__nextArea
            self.__nextArea = None
        window = self.__window
        tiles = self.__tiles
        for key in tiles.keys():
            if key not in window:
                del tiles[key]

        for tile in tiles.itervalues():
            if tile.values:
                if tile.old is None:
                    tile.old = tile.values
                else:
                    tile.old.update(tile.values)
                tile.values = {}
            # Картинка плитки не меняется: те же значения, только перенесены в прежние.
            tile.complete = False
            tile.cells = None

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

    def __tileRects(self, tile):
        # Прямоугольники одной плитки: интервалы одного значения в строке, одинаковые интервалы соседних строк
        # сливаются. Между плитками не сливаются — плитка перестраивается отдельно.
        values = tile.values
        old = tile.old or {}
        drawable = self.drawable
        step = 1 << self.minLevel
        size = 1 << self.tileShift
        tx, ty = tile.key
        x0, y0, x1, y1 = self.area
        xs = [ x for x in xrange(tx, tx + size, step) if x + step > x0 and x < x1 ]
        rects = []
        opened = {}
        for y in xrange(ty, ty + size, step):
            if y + step <= y0 or y >= y1:
                opened = {}
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

        return [ tuple(rect) for rect in rects ]

    def rects(self):
        # [(value, x0, y0, x1, y1)] в пикселях от якоря и признак, что список изменился с прошлого вызова.
        if not self.__rectsDirty:
            return (self.__rects, False)
        self.__rectsDirty = False
        tiles = self.__tiles
        rects = []
        for key in sorted(self.__window):
            tile = tiles[key]
            if tile.rects is None:
                tile.rects = self.__tileRects(tile)
            rects.extend(tile.rects)

        if rects == self.__rects:
            return (self.__rects, False)
        self.__rects = rects
        return (rects, True)
