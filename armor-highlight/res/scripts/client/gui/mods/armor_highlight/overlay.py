# -*- coding: utf-8 -*-
# Прямоугольники подсветки поверх экрана: GUI.Simple, по пулу на оттенок.
# Позиция — левый верхний угол, размер — оба в clip-координатах. В 0.4.0 размер задавался в режиме PIXEL,
# и квадраты выходили крупнее нужного: пиксели GUI в этом клиенте не совпадают с пикселями экрана
# (похоже, учитывается масштаб интерфейса). clip-координаты от масштаба не зависят.
# Прямоугольник, который не изменился, сохраняет свой квадрат: при уточнении сетки GUI трогается только там,
# где картинка поменялась. При сдвиге якоря (поворот камеры) переставляются все показанные квадраты.
import BigWorld
import GUI

from gui.mods.armor_highlight import logException


def _createQuad(texture, depth, colour):
    quad = GUI.Simple(texture)
    quad.materialFX = GUI.Simple.eMaterialFX.BLEND
    quad.widthMode = GUI.Simple.eSizeMode.CLIP
    quad.heightMode = GUI.Simple.eSizeMode.CLIP
    quad.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
    quad.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
    quad.horizontalAnchor = GUI.Simple.eHAnchor.LEFT
    quad.verticalAnchor = GUI.Simple.eVAnchor.TOP
    quad.position = (0.0, 0.0, depth)
    if colour is not None:
        quad.colour = colour
    quad.visible = False
    GUI.addRoot(quad)
    return quad


class _Pool(object):

    def __init__(self, texture, colour):
        self.texture = texture
        self.colour = colour
        self.quads = []
        self.free = []
        # (x0, y0, x1, y1) -> индекс квадрата
        self.byRect = {}


class Overlay(object):

    def __init__(self, paints, depth, createPerFrame, maxQuads, memoryTextures=()):
        # paints: {значение: (текстура, colour или None)}.
        # memoryTextures: id текстур, зарегистрированных через BigWorld.addScaleformTexture, — удаляются в destroy().
        self.__depth = depth
        self.__createPerFrame = createPerFrame
        self.__maxQuads = maxQuads
        self.__memoryTextures = tuple(memoryTextures)
        self.__pools = dict(((value, _Pool(texture, colour)) for value, (texture, colour) in paints.iteritems()))
        self.__anchor = None
        self.__rects = None
        self.__total = 0
        self.__shown = 0
        self.incomplete = False

    @property
    def shownCount(self):
        return self.__shown

    @property
    def quadCount(self):
        return self.__total

    def update(self, rects, rectsChanged, ax, ay, screenW, screenH, createLimit=None):
        # rects: [(значение, x0, y0, x1, y1)] в пикселях от якоря (ax, ay) — пиксели от левого верхнего угла экрана.
        anchor = (ax, ay, screenW, screenH)
        moved = anchor != self.__anchor
        resized = self.__anchor is None or self.__anchor[2:] != (screenW, screenH)
        if not moved and not rectsChanged and not self.incomplete and rects is self.__rects:
            return
        sx = 2.0 / screenW
        sy = 2.0 / screenH
        depth = self.__depth
        wanted = {}
        for rect in rects:
            byValue = wanted.get(rect[0])
            if byValue is None:
                byValue = wanted[rect[0]] = set()
            byValue.add(rect[1:])

        createLeft = self.__createPerFrame if createLimit is None else createLimit
        incomplete = False
        shown = 0
        for value, pool in self.__pools.iteritems():
            keep = wanted.get(value, ())
            quads = pool.quads
            byRect = pool.byRect
            freed = [ byRect.pop(rect) for rect in [ rect for rect in byRect if rect not in keep ] ]
            pool.free.extend(freed)

            if moved:
                for (x0, y0, x1, y1), idx in byRect.iteritems():
                    quad = quads[idx]
                    quad.position = ((ax + x0) * sx - 1.0, 1.0 - (ay + y0) * sy, depth)
                    if resized:
                        quad.size = ((x1 - x0) * sx, (y1 - y0) * sy)

            for rect in keep:
                if rect in byRect:
                    continue
                if pool.free:
                    idx = pool.free.pop()
                elif createLeft > 0 and self.__total < self.__maxQuads:
                    idx = len(quads)
                    quads.append(_createQuad(pool.texture, depth, pool.colour))
                    self.__total += 1
                    createLeft -= 1
                else:
                    incomplete = True
                    continue
                x0, y0, x1, y1 = rect
                quad = quads[idx]
                quad.position = ((ax + x0) * sx - 1.0, 1.0 - (ay + y0) * sy, depth)
                quad.size = ((x1 - x0) * sx, (y1 - y0) * sy)
                quad.visible = True
                byRect[rect] = idx

            if freed:
                # Освобождённые квадраты, которые не достались новым прямоугольникам, прячем.
                used = set(byRect.itervalues())
                for idx in freed:
                    if idx not in used:
                        quads[idx].visible = False

            shown += len(byRect)

        self.__anchor = anchor
        self.__rects = rects
        self.__shown = shown
        self.incomplete = incomplete

    def hide(self):
        for pool in self.__pools.itervalues():
            for idx in pool.byRect.itervalues():
                pool.quads[idx].visible = False
                pool.free.append(idx)

            pool.byRect.clear()

        self.__anchor = None
        self.__rects = None
        self.__shown = 0
        self.incomplete = False

    def destroy(self):
        for pool in self.__pools.itervalues():
            for quad in pool.quads:
                try:
                    GUI.delRoot(quad)
                except Exception:
                    logException('Overlay.destroy')

        self.__pools = {}
        for textureID in self.__memoryTextures:
            try:
                BigWorld.eraseScaleformTexture(textureID)
            except Exception:
                logException('Overlay.destroy')

        self.__memoryTextures = ()
        self.__total = 0
        self.__shown = 0
