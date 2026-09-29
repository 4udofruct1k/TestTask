# -*- coding: utf-8 -*-
# Пул GUI.Simple-квадратов в clip-позициях.
import GUI

from gui.mods.armor_highlight import logException


def _createQuad(texture, depth):
    quad = GUI.Simple(texture)
    quad.materialFX = GUI.Simple.eMaterialFX.BLEND
    quad.widthMode = GUI.Simple.eSizeMode.PIXEL
    quad.heightMode = GUI.Simple.eSizeMode.PIXEL
    quad.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
    quad.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
    quad.horizontalAnchor = GUI.Simple.eHAnchor.CENTER
    quad.verticalAnchor = GUI.Simple.eVAnchor.CENTER
    quad.position = (0.0, 0.0, depth)
    quad.visible = False
    GUI.addRoot(quad)
    return quad


class Overlay(object):

    def __init__(self, texture, depth, poolSize):
        self.__depth = depth
        self.__quads = [ _createQuad(texture, depth) for _ in xrange(poolSize) ]
        # Последние выставленные size и colour каждого квадрата: не трогаем GUI без изменений.
        self.__sizes = [None] * poolSize
        self.__colours = [None] * poolSize
        self.__shown = 0

    def update(self, items):
        # items: [(x, y, sizePx, (r, g, b, a)), ...] в clip-координатах.
        count = min(len(items), len(self.__quads))
        depth = self.__depth
        quads = self.__quads
        sizes = self.__sizes
        colours = self.__colours
        for idx in xrange(count):
            x, y, size, colour = items[idx]
            quad = quads[idx]
            quad.position = (x, y, depth)
            if sizes[idx] != size:
                quad.size = (size, size)
                sizes[idx] = size
            if colours[idx] != colour:
                quad.colour = colour
                colours[idx] = colour
            if idx >= self.__shown:
                quad.visible = True

        for idx in xrange(count, self.__shown):
            quads[idx].visible = False

        self.__shown = count

    def hide(self):
        if self.__shown:
            self.update(())

    def destroy(self):
        for quad in self.__quads:
            try:
                GUI.delRoot(quad)
            except Exception:
                logException('Overlay.destroy')

        self.__quads = []
        self.__sizes = []
        self.__colours = []
        self.__shown = 0
