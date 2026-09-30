# -*- coding: utf-8 -*-
# Панель у прицела в бою: шанс пробития в точке прицеливания в виде слотов, как снаряды на панели расходников.
# Слот: подложка, номер клавиши, иконка снаряда из игры (gui/maps/icons/ammopanel/battle_ammo), полоска шанса
# цветом градиента подсветки и процент. Без Alt — один слот текущего снаряда, с Alt — все снаряды орудия,
# текущий в рамке.
# Всё из GUI.Simple в CLIP-координатах (как квадраты подсветки) и GUI.Text; цвет — текстуры палитры: colour в этом
# клиенте ненадёжен. Квадрат на пару (место, текстура): текстуру у готового квадрата не меняем, лишние прячутся.
import GUI

from gui.mods.armor_highlight import logException, palette

# Глубина: перед квадратами подсветки (config.overlayDepth = 0.7), за интерфейсом боя.
_DEPTH_FRAME = 0.56
_DEPTH_PLATE = 0.55
_DEPTH_BAR_BACK = 0.54
_DEPTH_BAR = 0.53
_DEPTH_ICON = 0.52
_DEPTH_TEXT = 0.5
# Размеры в пикселях при высоте экрана 1080, дальше масштаб по высоте.
_BASE_HEIGHT = 1080.0
_OFFSET_X = 44
_ROW_H = 34
_ROW_GAP = 4
_PAD = 4
_KEY_W = 16
_ICON = 28
_BAR_W = 64
_BAR_H = 8
_SPACE = 8
_TEXT_W = 46
_FRAME = 2
_PLATE = palette.texturePath((0, 0, 0), 60)
_BAR_BACK = palette.texturePath((43, 43, 43), 80)
_FRAME_TEXTURE = palette.texturePath((255, 213, 43), 100)


class Row(object):
    # key — номер клавиши (u'1') или None, icon — путь к иконке или None, label — тип снаряда, если иконки нет,
    # prob — заполнение полоски 0..1 или None (нет полоски), text — подпись справа, current — рамка.
    __slots__ = ('key', 'icon', 'label', 'prob', 'text', 'current')

    def __init__(self, key, icon, label, prob, text, current):
        self.key = key
        self.icon = icon
        self.label = label
        self.prob = prob
        self.text = text
        self.current = current


class AimPanel(object):

    def __init__(self):
        self.__quads = {}
        self.__texts = {}
        self.__values = {}
        self.__rects = {}
        self.__used = set()
        self.__colours = None

    def setColours(self, steps, full, half, zero):
        # Полоска красится уровнем градиента, как подсветка (settings.gradientSteps и цвета).
        self.__colours = (steps, [ palette.texturePath(palette.nearestColour(rgb), 100) for rgb in palette.gradient(steps, full, half, zero) ])

    def show(self, rows, aimPx, screen):
        try:
            self.__used = set()
            unit = screen[1] / _BASE_HEIGHT
            hasKey = any((row.key is not None for row in rows))
            width = _PAD + (_KEY_W if hasKey else 0) + _ICON + _SPACE + _BAR_W + _SPACE + _TEXT_W + _PAD
            height = len(rows) * _ROW_H + (len(rows) - 1) * _ROW_GAP
            x0 = aimPx[0] + _OFFSET_X * unit
            y0 = aimPx[1] - height * unit / 2.0
            for idx, row in enumerate(rows):
                self.__drawRow(idx, row, x0, y0 + idx * (_ROW_H + _ROW_GAP) * unit, width, hasKey, unit, screen)

            self.__finish()
        except Exception:
            logException('AimPanel.show')

    def hide(self):
        self.__used = set()
        self.__finish()

    def destroy(self):
        for root in self.__quads.values() + self.__texts.values():
            try:
                GUI.delRoot(root)
            except Exception:
                logException('AimPanel.destroy')

        self.__quads = {}
        self.__texts = {}
        self.__values = {}
        self.__rects = {}
        self.__used = set()

    # --- строка ---

    def __drawRow(self, idx, row, x0, y, width, hasKey, unit, screen):
        u = lambda value: value * unit
        rowH = u(_ROW_H)
        if row.current:
            f = u(_FRAME)
            w = u(width)
            for side, rect in (('T', (x0 - f, y - f, w + 2 * f, f)),
             ('B', (x0 - f, y + rowH, w + 2 * f, f)),
             ('L', (x0 - f, y, f, rowH)),
             ('R', (x0 + w, y, f, rowH))):
                self.__sprite((idx, 'frame' + side), _FRAME_TEXTURE, rect, _DEPTH_FRAME, screen)

        self.__sprite((idx, 'plate'), _PLATE, (x0, y, u(width), rowH), _DEPTH_PLATE, screen)
        x = x0 + u(_PAD)
        midY = y + rowH / 2.0
        if hasKey:
            if row.key is not None:
                self.__text((idx, 'key'), row.key, x + u(_KEY_W) / 2.0, midY, screen)
            x += u(_KEY_W)
        iconY = midY - u(_ICON) / 2.0
        if row.icon is not None:
            self.__sprite((idx, 'icon'), row.icon, (x, iconY, u(_ICON), u(_ICON)), _DEPTH_ICON, screen)
        elif row.label:
            self.__text((idx, 'label'), row.label, x + u(_ICON) / 2.0, midY, screen)
        x += u(_ICON) + u(_SPACE)
        barY = midY - u(_BAR_H) / 2.0
        self.__sprite((idx, 'barBack'), _BAR_BACK, (x, barY, u(_BAR_W), u(_BAR_H)), _DEPTH_BAR_BACK, screen)
        if row.prob is not None and row.prob > 0.0 and self.__colours is not None:
            steps, textures = self.__colours
            fill = max(u(2), u(_BAR_W) * min(1.0, row.prob))
            self.__sprite((idx, 'bar'), textures[palette.probabilityLevel(row.prob, steps)], (x, barY, fill, u(_BAR_H)), _DEPTH_BAR, screen)
        x += u(_BAR_W) + u(_SPACE)
        self.__text((idx, 'value'), row.text, x + u(_TEXT_W) / 2.0, midY, screen)

    # --- элементы ---

    def __sprite(self, slot, texture, rect, depth, screen):
        key = (slot, texture)
        quad = self.__quads.get(key)
        if quad is None:
            quad = GUI.Simple(texture)
            quad.materialFX = GUI.Simple.eMaterialFX.BLEND
            quad.widthMode = GUI.Simple.eSizeMode.CLIP
            quad.heightMode = GUI.Simple.eSizeMode.CLIP
            quad.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
            quad.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
            quad.horizontalAnchor = GUI.Simple.eHAnchor.LEFT
            quad.verticalAnchor = GUI.Simple.eVAnchor.TOP
            quad.visible = False
            GUI.addRoot(quad)
            self.__quads[key] = quad
        self.__place(key, quad, rect, depth, screen, True)

    def __text(self, slot, value, cx, cy, screen):
        # Текст по центру точки (cx, cy).
        key = ('text', slot)
        text = self.__texts.get(slot)
        if text is None:
            text = GUI.Text('')
            text.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
            text.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
            text.horizontalAnchor = GUI.Simple.eHAnchor.CENTER
            text.verticalAnchor = GUI.Simple.eVAnchor.CENTER
            text.multiline = False
            text.visible = False
            GUI.addRoot(text)
            self.__texts[slot] = text
        if self.__values.get(slot) != value:
            self.__values[slot] = value
            try:
                text.text = value
            except Exception:
                text.text = value.encode('utf-8')
        self.__place(key, text, (cx, cy, 0.0, 0.0), _DEPTH_TEXT, screen, False)

    def __place(self, key, root, rect, depth, screen, sized):
        self.__used.add(key)
        if self.__rects.get(key) != rect:
            self.__rects[key] = rect
            x, y, w, h = rect
            root.position = (x / screen[0] * 2.0 - 1.0, 1.0 - y / screen[1] * 2.0, depth)
            if sized:
                root.size = (w / screen[0] * 2.0, h / screen[1] * 2.0)
        if not root.visible:
            root.visible = True

    def __finish(self):
        for key, quad in self.__quads.iteritems():
            if quad.visible and key not in self.__used:
                quad.visible = False

        for slot, text in self.__texts.iteritems():
            if text.visible and ('text', slot) not in self.__used:
                text.visible = False
