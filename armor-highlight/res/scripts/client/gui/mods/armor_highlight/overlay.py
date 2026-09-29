# -*- coding: utf-8 -*-
import GUI

from gui.mods.armor_highlight import log, logException

# Белая текстура движка (resources.xml клиента, <whiteBmp>).
WHITE_TEXTURE = 'system/maps/col_white.dds'


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

    def __init__(self, depth):
        self.__depth = depth
        self.__roots = []

    def addTestSquare(self, texture, x, y, sizePx, colour):
        quad = _createQuad(texture, self.__depth)
        self.__roots.append(quad)
        quad.size = (sizePx, sizePx)
        quad.position = (x, y, self.__depth)
        quad.colour = colour
        quad.visible = True
        log('test square: texture=%r clip=(%.3f, %.3f) size=%dpx colour=%r depth=%.2f', texture, x, y, sizePx, colour, self.__depth)

    def destroy(self):
        for quad in self.__roots:
            try:
                GUI.delRoot(quad)
            except Exception:
                logException('Overlay.destroy')

        self.__roots = []
