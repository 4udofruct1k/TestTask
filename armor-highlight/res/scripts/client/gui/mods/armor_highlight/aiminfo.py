# -*- coding: utf-8 -*-
# Подпись у прицела в бою: шанс пробития в точке прицеливания.
import GUI

from gui.mods.armor_highlight import logException

# Справа от центра прицела, px; глубина — перед квадратами подсветки (0.7), за интерфейсом боя (0.1).
_OFFSET_PX = (36, -10)
_DEPTH = 0.5


class AimInfo(object):

    def __init__(self):
        self.__text = None
        self.__value = None

    def show(self, value, px, screen):
        # value — строка (unicode), px — центр прицела в пикселях экрана, screen — (ширина, высота).
        try:
            if self.__text is None:
                text = GUI.Text('')
                text.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
                text.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
                text.horizontalAnchor = GUI.Simple.eHAnchor.LEFT
                text.verticalAnchor = GUI.Simple.eVAnchor.TOP
                text.multiline = False
                GUI.addRoot(text)
                self.__text = text
                self.__value = None
            x = (px[0] + _OFFSET_PX[0]) / float(screen[0]) * 2.0 - 1.0
            y = 1.0 - (px[1] + _OFFSET_PX[1]) / float(screen[1]) * 2.0
            self.__text.position = (x, y, _DEPTH)
            if value != self.__value:
                self.__value = value
                try:
                    self.__text.text = value
                except Exception:
                    self.__text.text = value.encode('utf-8')
            self.__text.visible = True
        except Exception:
            logException('AimInfo.show')

    def hide(self):
        if self.__text is not None:
            self.__text.visible = False

    def destroy(self):
        if self.__text is not None:
            try:
                GUI.delRoot(self.__text)
            except Exception:
                logException('AimInfo.destroy')

            self.__text = None
            self.__value = None
