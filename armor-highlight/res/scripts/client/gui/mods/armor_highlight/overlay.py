# -*- coding: utf-8 -*-
# Прямоугольники подсветки поверх экрана: GUI.Simple, по пулу на результат расчёта.
# Позиция — левый верхний угол в clip-координатах, размер — в пикселях.
import GUI

from gui.mods.armor_highlight import log, logException

# Прозрачность от сведения квантуется: цвет квадратов меняется только при смене уровня.
ALPHA_STEPS = 16


def _createQuad(texture, depth):
    quad = GUI.Simple(texture)
    quad.materialFX = GUI.Simple.eMaterialFX.BLEND
    quad.widthMode = GUI.Simple.eSizeMode.PIXEL
    quad.heightMode = GUI.Simple.eSizeMode.PIXEL
    quad.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
    quad.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
    quad.horizontalAnchor = GUI.Simple.eHAnchor.LEFT
    quad.verticalAnchor = GUI.Simple.eVAnchor.TOP
    quad.position = (0.0, 0.0, depth)
    quad.visible = False
    GUI.addRoot(quad)
    return quad


def _readColour(quad):
    colour = quad.colour
    try:
        return (float(colour.x), float(colour.y), float(colour.z), float(colour.w))
    except AttributeError:
        return tuple((float(value) for value in colour))


class _Pool(object):

    def __init__(self, kind, texture, tint):
        self.kind = kind
        self.texture = texture
        # (r, g, b) 0..255 для режима tint; None — цвет уже в текстуре.
        self.tint = tint
        self.quads = []
        # Последний выставленный (x, y, w, h) каждого квадрата: не трогаем GUI без изменений.
        self.rects = []
        self.shown = 0
        self.used = 0


def _probeColourScale(texture):
    # Масштаб colour в этом клиенте не документирован: 0..255 у BigWorld, у pybind11-обёртки может быть 0..1.
    # Пробный квадрат не добавляется на экран: читаем цвет по умолчанию (непрозрачный белый),
    # ставим пробный и читаем снова. Возвращает максимум шкалы или None, если по умолчанию не белый.
    top = None
    try:
        probe = GUI.Simple(texture)
        default = _readColour(probe)
        if default and default[0] > 0.0 and all((abs(value - default[0]) <= 1e-06 * default[0] for value in default)):
            top = default[0]
        test = (0.5 * (top or 255.0), 0.25 * (top or 255.0), 0.0, 0.75 * (top or 255.0))
        probe.colour = test
        log('colour readback: default %s, set %s, got %s', default, test, _readColour(probe))
    except Exception:
        logException('colour probe')

    return top


class Overlay(object):

    def __init__(self, textures, tints, opacity, fadeWithColour, depth, precreate, createPerFrame, maxPerKind):
        # textures: {kind: путь к текстуре}; tints: {kind: (r, g, b)} для режима tint или None — цвет в текстуре.
        self.__depth = depth
        self.__opacity = opacity
        self.__createPerFrame = createPerFrame
        self.__maxPerKind = maxPerKind
        self.__pools = dict(((kind, _Pool(kind, texture, tints[kind] if tints else None)) for kind, texture in textures.iteritems()))
        self.__colourMax = _probeColourScale(textures[min(textures)])
        if self.__colourMax is None and tints:
            self.__colourMax = 255.0
        # С текстурами colour видимых квадратов не трогаем, пока не попросили (fadeWithColour):
        # если colour в этом клиенте заменяет цвет, а не умножает текстуру, квадраты снова станут белыми.
        self.__useColour = self.__colourMax is not None and (bool(tints) or fadeWithColour)
        self.__alphaLevel = ALPHA_STEPS
        self.__lastKey = None
        for pool in self.__pools.itervalues():
            for _ in xrange(precreate):
                self.__grow(pool)

    @property
    def canFade(self):
        # Можно ли менять прозрачность (затемнение несведённого прицела).
        return self.__useColour

    def __grow(self, pool):
        quad = _createQuad(pool.texture, self.__depth)
        if self.__useColour:
            quad.colour = self.__colourFor(pool, self.__alphaLevel)
        pool.quads.append(quad)
        pool.rects.append(None)

    def __colourFor(self, pool, alphaLevel):
        top = self.__colourMax
        alpha = top * alphaLevel / float(ALPHA_STEPS)
        if pool.tint is None:
            return (top, top, top, alpha)
        r, g, b = pool.tint
        scale = top / 255.0
        return (r * scale, g * scale, b * scale, alpha * self.__opacity)

    def __setAlpha(self, alphaLevel):
        self.__alphaLevel = alphaLevel
        for pool in self.__pools.itervalues():
            colour = self.__colourFor(pool, alphaLevel)
            for quad in pool.quads:
                quad.colour = colour

    @property
    def shownCount(self):
        return sum((pool.shown for pool in self.__pools.itervalues()))

    def update(self, runs, ax, ay, cellPx, rowPx, screenW, screenH, alphaLevel, changed):
        # runs: [(kind, i0, i1, j)] от Lattice.runs(); (ax, ay) — якорь в пикселях от левого верхнего угла.
        if self.__useColour and alphaLevel != self.__alphaLevel:
            self.__setAlpha(alphaLevel)
        key = (ax, ay, cellPx, rowPx, screenW, screenH)
        if not changed and key == self.__lastKey:
            return
        self.__lastKey = key
        sx = 2.0 / screenW
        sy = 2.0 / screenH
        depth = self.__depth
        pools = self.__pools
        for pool in pools.itervalues():
            pool.used = 0

        createLeft = self.__createPerFrame
        for kind, i0, i1, j in runs:
            pool = pools.get(kind)
            if pool is None:
                continue
            idx = pool.used
            if idx >= len(pool.quads):
                if createLeft <= 0 or idx >= self.__maxPerKind:
                    # Квадратов не хватило: дорисуем в следующих кадрах.
                    self.__lastKey = None
                    continue
                self.__grow(pool)
                createLeft -= 1
            rect = ((ax + i0 * cellPx) * sx - 1.0, 1.0 - (ay + j * cellPx) * sy, (i1 - i0) * cellPx, rowPx)
            old = pool.rects[idx]
            if old != rect:
                quad = pool.quads[idx]
                quad.position = (rect[0], rect[1], depth)
                if old is None or old[2] != rect[2] or old[3] != rect[3]:
                    quad.size = (rect[2], rect[3])
                pool.rects[idx] = rect
            if idx >= pool.shown:
                pool.quads[idx].visible = True
            pool.used = idx + 1

        for pool in pools.itervalues():
            quads = pool.quads
            for idx in xrange(pool.used, pool.shown):
                quads[idx].visible = False

            pool.shown = pool.used

    def hide(self):
        self.__lastKey = None
        for pool in self.__pools.itervalues():
            quads = pool.quads
            for idx in xrange(pool.shown):
                quads[idx].visible = False

            pool.shown = 0

    def destroy(self):
        for pool in self.__pools.itervalues():
            for quad in pool.quads:
                try:
                    GUI.delRoot(quad)
                except Exception:
                    logException('Overlay.destroy')

            pool.quads = []
            pool.rects = []
            pool.shown = 0

        self.__pools = {}
