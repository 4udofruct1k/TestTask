# -*- coding: utf-8 -*-
# Панель настроек в ангаре — запасная: основное окно в ModsSettingsAPI. Ctrl+Shift+Y открывает и закрывает её
# всегда (на случай, если окна мода там не видно); без ModsSettingsAPI — и пункт «Подсветка брони: настройки»
# в ModsList API.
# Стрелки вверх/вниз — пункт, влево/вправо — значение, Enter — переключить, задать клавишу или выполнить действие.
# Значения сразу сохраняются (settings.py) и применяются.
import GUI
import Keys
from gui import InputHandler
from messenger import MessengerEntry

from gui.mods.armor_highlight import log, logException, palette
from gui.mods.armor_highlight.settings import COLOUR_PRESETS, ITEMS, PANEL_KEY, hotkeyMatches, hotkeyName

MODS_LIST_ID = 'max.armor_highlight.settings'
# Вверху по центру, над танком, перед интерфейсом лобби (0.5); подложка — за текстом.
_TEXT_POSITION = (-0.33, 0.8)
_TEXT_DEPTH = 0.45
_PLATE_DEPTH = 0.46
_PLATE_PADDING = (0.015, 0.02)
_PLATE_WIDTH = 0.7
# Высота строки в clip-координатах (оценка: ~22 px при 1080 строках) и сколько пунктов видно сразу.
_LINE_HEIGHT = 0.042
_VISIBLE_ITEMS = 9
_MODIFIERS = frozenset((Keys.KEY_LCONTROL, Keys.KEY_RCONTROL, Keys.KEY_LSHIFT, Keys.KEY_RSHIFT, Keys.KEY_LALT, Keys.KEY_RALT))
# Действия в конце списка: (ключ, подпись).
_ACTIONS = (('view', u'Просмотр на танке'), ('reset', u'Сбросить все настройки'))


class SettingsPanel(object):

    def __init__(self, settings, viewMode):
        self.__settings = settings
        self.__viewMode = viewMode
        self.__inLobby = False
        self.__subscribed = False
        self.__text = None
        self.__plate = None
        self.__textValue = None
        self.__index = 0
        self.__top = 0
        self.__capturing = False
        self.__confirmReset = False

    @property
    def isOpen(self):
        return self.__text is not None

    def register(self):
        # Пункт в списке модов, если он есть. Без него — только Ctrl+Shift+Y. С ModsSettingsAPI пункт не нужен.
        if self.__settings.hasApi:
            return
        try:
            from gui.modsListApi import g_modsListApi
        except ImportError:
            log('ModsList API not found, settings panel: %s in the hangar', hotkeyName(PANEL_KEY))
            return

        g_modsListApi.addModification(id=MODS_LIST_ID, name='Подсветка брони: настройки', description='Настройки подсветки брони. Открыть и закрыть — также %s в ангаре.' % hotkeyName(PANEL_KEY), icon=palette.ICON_PATH, enabled=True, login=False, lobby=True, callback=self.toggle)

    def onLobby(self, inLobby):
        self.__inLobby = inLobby
        if inLobby and not self.__subscribed:
            InputHandler.g_instance.onKeyDown += self.__onKeyDown
            self.__subscribed = True
        elif not inLobby:
            self.close()
            if self.__subscribed:
                InputHandler.g_instance.onKeyDown -= self.__onKeyDown
                self.__subscribed = False

    def toggle(self):
        try:
            if self.isOpen:
                self.close()
            else:
                self.open()
        except Exception:
            logException('SettingsPanel.toggle')

    def open(self):
        if self.isOpen or not self.__inLobby:
            return
        lines = 4 + _VISIBLE_ITEMS + 2
        try:
            plate = GUI.Simple(palette.texturePath(palette.nearestColour((0, 0, 0)), palette.nearestOpacity(80)))
            plate.materialFX = GUI.Simple.eMaterialFX.BLEND
            plate.widthMode = GUI.Simple.eSizeMode.CLIP
            plate.heightMode = GUI.Simple.eSizeMode.CLIP
            plate.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
            plate.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
            plate.horizontalAnchor = GUI.Simple.eHAnchor.LEFT
            plate.verticalAnchor = GUI.Simple.eVAnchor.TOP
            plate.position = (_TEXT_POSITION[0] - _PLATE_PADDING[0], _TEXT_POSITION[1] + _PLATE_PADDING[1], _PLATE_DEPTH)
            plate.size = (_PLATE_WIDTH, lines * _LINE_HEIGHT + 2 * _PLATE_PADDING[1])
            plate.visible = True
            GUI.addRoot(plate)
            self.__plate = plate
        except Exception:
            logException('SettingsPanel.plate')

        text = GUI.Text('')
        text.horizontalPositionMode = GUI.Simple.ePositionMode.CLIP
        text.verticalPositionMode = GUI.Simple.ePositionMode.CLIP
        text.horizontalAnchor = GUI.Simple.eHAnchor.LEFT
        text.verticalAnchor = GUI.Simple.eVAnchor.TOP
        text.multiline = True
        text.position = (_TEXT_POSITION[0], _TEXT_POSITION[1], _TEXT_DEPTH)
        text.visible = True
        GUI.addRoot(text)
        self.__text = text
        self.__textValue = None
        self.__capturing = False
        self.__confirmReset = False
        self.__render()
        log('settings panel open')

    def close(self):
        if self.__text is None:
            return
        for root in (self.__text, self.__plate):
            if root is None:
                continue
            try:
                GUI.delRoot(root)
            except Exception:
                logException('SettingsPanel.close')

        self.__plate = None
        self.__text = None
        self.__textValue = None
        self.__capturing = False
        log('settings panel closed')

    # --- ввод ---

    def __onKeyDown(self, event):
        try:
            if self.__capturing:
                self.__capture(event)
                return
            if self.__isChatFocused():
                return
            if hotkeyMatches(PANEL_KEY, event):
                self.toggle()
                return
            if not self.isOpen:
                return
            key = event.key
            count = len(ITEMS) + len(_ACTIONS)
            if key == Keys.KEY_UPARROW:
                self.__index = (self.__index - 1) % count
            elif key == Keys.KEY_DOWNARROW:
                self.__index = (self.__index + 1) % count
            elif key == Keys.KEY_LEFTARROW:
                self.__change(-1)
            elif key == Keys.KEY_RIGHTARROW:
                self.__change(1)
            elif key in (Keys.KEY_RETURN, Keys.KEY_NUMPADENTER):
                self.__activate()
            else:
                return
            if key != Keys.KEY_RETURN and key != Keys.KEY_NUMPADENTER:
                self.__confirmReset = False
            self.__render()
        except Exception:
            logException('SettingsPanel.onKeyDown')

    @staticmethod
    def __isChatFocused():
        messengerGui = MessengerEntry.g_instance.gui
        return messengerGui is not None and messengerGui.isFocused()

    def __capture(self, event):
        # Задаём клавишу вкл/выкл: следующее нажатие (не модификатор) с зажатыми модификаторами.
        if event.key in _MODIFIERS:
            return
        self.__capturing = False
        if event.key != Keys.KEY_BACKSPACE:
            self.__settings.update({'toggleKey': {'key': event.key,
                           'ctrl': bool(event.isCtrlDown()),
                           'alt': bool(event.isAltDown()),
                           'shift': bool(event.isShiftDown())}})
        self.__render()

    def __change(self, delta):
        if self.__index >= len(ITEMS):
            return
        key, kind, _, options, _ = ITEMS[self.__index]
        value = self.__settings.values[key]
        if kind == 'bool':
            value = not value
        elif kind == 'choice':
            value = max(0, min(len(options) - 1, int(value) + delta))
        elif kind == 'int':
            low, high, step, _ = options
            value = max(low, min(high, int(value) + delta * step))
        elif kind == 'colour':
            names = [ preset[0] for preset in COLOUR_PRESETS ]
            idx = names.index(value) if value in names else -1 if delta > 0 else 0
            value = names[(idx + delta) % len(names)]
        else:
            return
        if value != self.__settings.values[key]:
            self.__settings.update({key: value})

    def __activate(self):
        if self.__index < len(ITEMS):
            kind = ITEMS[self.__index][1]
            if kind == 'hotkey':
                self.__capturing = True
            else:
                self.__change(1)
            return
        action = _ACTIONS[self.__index - len(ITEMS)][0]
        if action == 'view':
            self.__viewMode.toggle()
        elif action == 'reset':
            # Сброс — по второму Enter подряд.
            if self.__confirmReset:
                self.__confirmReset = False
                self.__settings.reset()
            else:
                self.__confirmReset = True

    # --- текст ---

    def __valueText(self, item):
        key, kind, _, options, _ = item
        value = self.__settings.values[key]
        if kind == 'bool':
            return u'вкл' if value else u'выкл'
        if kind == 'choice':
            idx = int(value)
            return options[idx] if 0 <= idx < len(options) else unicode(value)
        if kind == 'int':
            return u'%d%s' % (int(value), options[3])
        if kind == 'colour':
            for hexValue, name in COLOUR_PRESETS:
                if hexValue == value:
                    return name
            return u'#' + value
        if kind == 'hotkey':
            return unicode(hotkeyName(value))
        return unicode(value)

    def __render(self):
        if self.__text is None:
            return
        count = len(ITEMS) + len(_ACTIONS)
        # Видно _VISIBLE_ITEMS пунктов подряд; окно едет за выбранным.
        if self.__index < self.__top:
            self.__top = self.__index
        elif self.__index >= self.__top + _VISIBLE_ITEMS:
            self.__top = self.__index - _VISIBLE_ITEMS + 1
        lines = [u'ПОДСВЕТКА БРОНИ — НАСТРОЙКИ   (%s — закрыть)' % hotkeyName(PANEL_KEY), u'Стрелки вверх/вниз — пункт, влево/вправо — значение, Enter — переключить', u'']
        lines.append(u'    …' if self.__top > 0 else u'')
        for idx in xrange(self.__top, min(count, self.__top + _VISIBLE_ITEMS)):
            marker = u'>  ' if idx == self.__index else u'     '
            if idx < len(ITEMS):
                item = ITEMS[idx]
                lines.append(u'%s%s:  %s' % (marker, item[2], self.__valueText(item)))
                continue
            action, label = _ACTIONS[idx - len(ITEMS)]
            if action == 'view':
                label = u'%s: %s  (Enter)' % (label, u'открыт' if self.__viewMode.isActive else u'закрыт')
            elif self.__confirmReset:
                label = u'%s — нажмите Enter ещё раз' % label
            else:
                label = u'%s  (Enter)' % label
            lines.append(marker + label)

        lines.append(u'    …' if self.__top + _VISIBLE_ITEMS < count else u'')
        if self.__capturing:
            lines.append(u'Нажмите новую клавишу или сочетание для вкл/выкл в бою. Backspace — отмена.')
        elif self.__index < len(ITEMS) and ITEMS[self.__index][4]:
            lines.append(ITEMS[self.__index][4])
        else:
            lines.append(u'')
        self.__setText(u'\n'.join(lines))

    def __setText(self, value):
        if value == self.__textValue:
            return
        self.__textValue = value
        try:
            self.__text.text = value
        except Exception:
            # Если GUI.Text не принимает unicode — пробуем utf-8.
            try:
                self.__text.text = value.encode('utf-8')
            except Exception:
                logException('SettingsPanel.setText')
