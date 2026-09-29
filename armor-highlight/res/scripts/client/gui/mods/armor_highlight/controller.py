# -*- coding: utf-8 -*-
import BigWorld
from aih_constants import SHOT_RESULT

from gui.mods.armor_highlight import config, log, logException
from gui.mods.armor_highlight.overlay import Overlay, WHITE_TEXTURE


def _rgba(rgb, opacity):
    r, g, b = rgb
    return (r, g, b, int(round(255 * opacity)))


class ArmorHighlightController(object):

    def __init__(self):
        self.__overlay = None

    def start(self):
        if self.__overlay is not None:
            self.stop()
        self.__overlay = Overlay(config.overlayDepth)
        self.__showTestSquares()

    def stop(self):
        if self.__overlay is not None:
            self.__overlay.destroy()
            self.__overlay = None

    def __showTestSquares(self):
        # Фаза 0: проверка, что GUI.Simple виден поверх боевого интерфейса.
        # Центр — GUI.Simple('') по спецификации, справа — тот же квадрат с белой текстурой движка.
        screenW, screenH = BigWorld.screenSize()[:2]
        log('screen size: %dx%d', screenW, screenH)
        size = config.testSquareSizePx
        squares = (('', 0.0, config.COLORS[SHOT_RESULT.GREAT_PIERCED]),
         (WHITE_TEXTURE, 2.0 * 2 * size / screenW, config.COLORS[SHOT_RESULT.NOT_PIERCED]))
        for texture, x, rgb in squares:
            try:
                self.__overlay.addTestSquare(texture, x, 0.0, size, _rgba(rgb, config.opacity))
            except Exception:
                logException('test square %r' % texture)
