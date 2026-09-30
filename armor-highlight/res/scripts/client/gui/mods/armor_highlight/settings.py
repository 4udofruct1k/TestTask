# -*- coding: utf-8 -*-
# Настройки мода. Свои: панель в ангаре (panel.py, Ctrl+Shift+Y) и файл settings.json рядом с preferences.xml
# клиента — без других модов (ModsSettingsAPI не нужен). Описание пунктов панели — ITEMS.
import json
import os

import BigWorld
import Keys

from gui.mods.armor_highlight import log, logException, palette

# Увеличить, если значения по умолчанию должны заменить сохранённые.
FILE_VERSION = 1
FILE_DIR = 'mods_armor_highlight'
FILE_NAME = 'settings.json'

# Для всей цели размер округляется вниз до степени двойки: 3 px -> 2 px.
CELL_SIZES = (1, 2, 3, 4, 8)
# Где подсвечивать: область вокруг центра прицела или вся цель — с уточнением границ или каждая ячейка
# (в фоне, показ целиком / за один кадр, игра замирает).
MODES = ('aim', 'adaptive', 'background', 'blocking')
MODE_LABELS = (u'вокруг центра прицела', u'вся цель, с уточнением', u'вся цель, каждая ячейка в фоне', u'вся цель, каждая ячейка за кадр')
# Радиус области вокруг центра прицела, px.
AIM_RADII = (40, 60, 80, 120, 160)
# Шаг поиска мелких зон: None — подобрать по размеру цели, иначе уровень сетки (16 px -> 4, ...).
SEARCH_STEPS = (None, 16, 8, 4, 2)
FOCUS_RADII = (0, 10, 20, 40)
COLOUR_MODES = ('texture', 'memory', 'tint255', 'tint1')
COLOUR_MODE_LABELS = (u'текстуры из пакета', u'текстуры в памяти', u'colour 0–255', u'colour 0–1')
# Цвета на выбор в панели: (hex, название).
COLOUR_PRESETS = (('1db83a', u'зелёный'),
 ('7cfc00', u'салатовый'),
 ('00c8ff', u'голубой'),
 ('2060ff', u'синий'),
 ('ffd200', u'жёлтый'),
 ('ff8a00', u'оранжевый'),
 ('ff4d00', u'красно-оранжевый'),
 ('d11a1a', u'красный'),
 ('ff00c8', u'пурпурный'),
 ('8a2be2', u'фиолетовый'),
 ('ffffff', u'белый'))
# Панель в ангаре открывается и закрывается этим сочетанием.
PANEL_KEY = {'key': Keys.KEY_Y, 'ctrl': True, 'alt': False, 'shift': True}

DEFAULTS = {'enabled': True,
 'toggleKey': {'key': Keys.KEY_Y, 'ctrl': False, 'alt': False, 'shift': False},
 'showWhileMoving': True,
 'showInArcade': True,
 'stickyTarget': True,
 'appearDelayMs': 100,
 'mode': 0,
 'aimRadius': 1,
 'cellSize': 2,
 'searchStep': 0,
 'focusRadius': 2,
 'frameBudgetMs': 3,
 'previewBudgetMs': 10,
 'colorFull': palette.DEFAULT_FULL,
 'colorHalf': palette.DEFAULT_HALF,
 'colorZero': palette.DEFAULT_ZERO,
 'gradientSteps': 2,
 'opacity': 50,
 'colourMode': 0}

# Пункты панели: (ключ, вид, подпись, варианты или (от, до, шаг, единица), подсказка).
# Виды: bool, choice (индекс в вариантах), int, colour (hex), hotkey.
ITEMS = (('enabled', 'bool', u'Подсветка', None, u'Выключено — подсветки нет ни в бою, ни в просмотре.'),
 ('toggleKey', 'hotkey', u'Клавиша вкл/выкл в бою', None, u'В начале каждого боя подсветка включена. Enter — задать: нажмите новую клавишу или сочетание, Backspace — отмена.'),
 ('mode', 'choice', u'Где подсвечивать', MODE_LABELS, u'Вокруг центра прицела — круг, нагрузка небольшая. Вся цель — для проверки, тяжелее.'),
 ('aimRadius', 'choice', u'Радиус круга', tuple((u'%d px' % radius for radius in AIM_RADII)), u'Вдвое больше радиус — вчетверо больше точек.'),
 ('cellSize', 'choice', u'Размер ячейки', tuple((u'%d px' % size for size in CELL_SIZES)), u'Мельче — точнее, но дольше пересчёт. На большом круге основа крупнее, границы уточняются до этого размера.'),
 ('gradientSteps', 'choice', u'Оттенков в переходе', tuple((unicode(steps) for steps in palette.GRADIENT_STEPS)), u'Сколько цветов между 100% и 0%.'),
 ('opacity', 'int', u'Непрозрачность', (10, 100, 10, u'%'), u''),
 ('colorFull', 'colour', u'Цвет: пробитие 100%', None, u''),
 ('colorHalf', 'colour', u'Цвет: пробитие 50%', None, u''),
 ('colorZero', 'colour', u'Цвет: не пробивает', None, u'Не пробивает или нет урона.'),
 ('appearDelayMs', 'int', u'Задержка появления', (0, 1000, 50, u' мс'), u'С момента, когда цель под прицелом.'),
 ('showWhileMoving', 'bool', u'Показывать в движении', None, u'Выключено — только когда свой танк стоит.'),
 ('showInArcade', 'bool', u'Показывать в аркадном режиме', None, u'Выключено — только в снайперском.'),
 ('stickyTarget', 'bool', u'Держать цель, когда прицел ушёл', None, u'Подсветка остаётся на последней цели, пока прицел не на другом противнике.'),
 ('frameBudgetMs', 'int', u'Нагрузка в бою', (1, 10, 1, u' мс/кадр'), u'Всё время мода за кадр. Больше — быстрее прорисовка, ниже FPS.'),
 ('previewBudgetMs', 'int', u'Нагрузка в просмотре', (5, 50, 5, u' мс/кадр'), u'То же в ангаре.'),
 ('searchStep', 'choice', u'Шаг поиска (вся цель)', tuple((u'авто' if step is None else u'%d px' % step for step in SEARCH_STEPS)), u'Только для «вся цель, с уточнением».'),
 ('focusRadius', 'choice', u'Под прицелом (вся цель)', tuple((u'выкл' if radius == 0 else u'%d px' % radius for radius in FOCUS_RADII)), u'Только для «вся цель, с уточнением».'),
 ('colourMode', 'choice', u'Способ окраски', COLOUR_MODE_LABELS, u'Если цвета неправильные или квадраты белые — попробуйте другой.'))

_KEY_NAMES = dict(((getattr(Keys, name), name[4:]) for name in dir(Keys) if name.startswith('KEY_') and isinstance(getattr(Keys, name), int)))


def keyName(key):
    return _KEY_NAMES.get(key, str(key))


def hotkeyName(hotkey):
    # «Ctrl+Shift+Y».
    parts = [ label for flag, label in (('ctrl', 'Ctrl'), ('alt', 'Alt'), ('shift', 'Shift')) if hotkey.get(flag) ]
    parts.append(keyName(hotkey.get('key')))
    return '+'.join(parts)


def hotkeyMatches(hotkey, event):
    return event.key == hotkey.get('key') and bool(event.isCtrlDown()) == bool(hotkey.get('ctrl')) and bool(event.isAltDown()) == bool(hotkey.get('alt')) and bool(event.isShiftDown()) == bool(hotkey.get('shift'))


def _settingsPath():
    # Рядом с preferences.xml клиента, как его кэши (helpers/local_cache.py): туда игра точно может писать.
    prefs = BigWorld.getPreferencesFilePath()
    if isinstance(prefs, str):
        prefs = prefs.decode('utf-8', 'replace')
    return os.path.join(os.path.dirname(prefs), FILE_DIR, FILE_NAME)


def _valid(key, value):
    default = DEFAULTS[key]
    if isinstance(default, bool):
        return isinstance(value, bool)
    if key == 'toggleKey':
        return isinstance(value, dict) and isinstance(value.get('key'), int)
    if isinstance(default, basestring):
        return isinstance(value, basestring) and len(value) == 6
    return isinstance(value, (int, float)) and not isinstance(value, bool)


class Settings(object):

    def __init__(self):
        self.values = dict(DEFAULTS)
        self.path = None
        self.__listeners = []

    def load(self):
        self.path = _settingsPath()
        try:
            if os.path.isfile(self.path):
                with open(self.path, 'rb') as f:
                    data = json.load(f)
                if data.get('version') == FILE_VERSION:
                    for key, value in (data.get('values') or {}).iteritems():
                        key = str(key)
                        if key in DEFAULTS and _valid(key, value):
                            if key == 'toggleKey':
                                value = dict(((str(k), v) for k, v in value.iteritems()))
                            elif isinstance(value, unicode):
                                value = str(value)
                            self.values[key] = value

        except Exception:
            logException('settings.load')

        log('settings: %s (%s)', self.describe(), self.path.encode('utf-8'))

    def save(self):
        if self.path is None:
            return
        try:
            folder = os.path.dirname(self.path)
            if not os.path.isdir(folder):
                os.makedirs(folder)
            with open(self.path, 'wb') as f:
                json.dump({'version': FILE_VERSION,
                 'values': self.values}, f, indent=1, sort_keys=True)
        except Exception:
            logException('settings.save')

    def update(self, changes):
        # Новые значения: сохранить и сообщить подписчикам (сетка и квадраты создаются заново).
        for key, value in changes.iteritems():
            if key in DEFAULTS:
                self.values[key] = value

        self.save()
        log('settings changed: %s', self.describe())
        for callback in list(self.__listeners):
            try:
                callback()
            except Exception:
                logException('settings listener')

    def reset(self):
        self.update(dict(((key, dict(value) if isinstance(value, dict) else value) for key, value in DEFAULTS.iteritems())))

    def addListener(self, callback):
        if callback not in self.__listeners:
            self.__listeners.append(callback)

    def removeListener(self, callback):
        if callback in self.__listeners:
            self.__listeners.remove(callback)

    def describe(self):
        return ', '.join(('%s=%s' % (key, self.values[key]) for key in sorted(self.values)))

    # --- значения в удобном виде ---

    @property
    def enabled(self):
        return bool(self.values['enabled'])

    @property
    def showWhileMoving(self):
        return bool(self.values['showWhileMoving'])

    @property
    def showInArcade(self):
        return bool(self.values['showInArcade'])

    @property
    def stickyTarget(self):
        return bool(self.values['stickyTarget'])

    @property
    def appearDelay(self):
        return _number(self.values['appearDelayMs'], DEFAULTS['appearDelayMs']) / 1000.0

    @property
    def frameBudget(self):
        return max(0.5, _number(self.values['frameBudgetMs'], DEFAULTS['frameBudgetMs'])) / 1000.0

    @property
    def previewFrameBudget(self):
        return max(1.0, _number(self.values['previewBudgetMs'], DEFAULTS['previewBudgetMs'])) / 1000.0

    @property
    def cellPx(self):
        return CELL_SIZES[_index(self.values['cellSize'], CELL_SIZES, DEFAULTS['cellSize'])]

    @property
    def cellLevel(self):
        # Уровень сетки всей цели: 1 px -> 0, 2 и 3 px -> 1, 4 px -> 2, 8 px -> 3.
        return self.cellPx.bit_length() - 1

    @property
    def searchLevel(self):
        step = SEARCH_STEPS[_index(self.values['searchStep'], SEARCH_STEPS, DEFAULTS['searchStep'])]
        if step is None:
            return None
        return step.bit_length() - 1

    @property
    def focusRadius(self):
        return FOCUS_RADII[_index(self.values['focusRadius'], FOCUS_RADII, DEFAULTS['focusRadius'])]

    @property
    def mode(self):
        return MODES[_index(self.values['mode'], MODES, DEFAULTS['mode'])]

    @property
    def aimRadius(self):
        return AIM_RADII[_index(self.values['aimRadius'], AIM_RADII, DEFAULTS['aimRadius'])]

    @property
    def gradientSteps(self):
        return palette.GRADIENT_STEPS[_index(self.values['gradientSteps'], palette.GRADIENT_STEPS, DEFAULTS['gradientSteps'])]

    @property
    def opacity(self):
        return max(10, min(100, _number(self.values['opacity'], DEFAULTS['opacity'])))

    @property
    def colourMode(self):
        return COLOUR_MODES[_index(self.values['colourMode'], COLOUR_MODES, DEFAULTS['colourMode'])]

    def colours(self):
        # (100%, 50%, 0%) как (r, g, b).
        return (palette.parseColour(self.values['colorFull'], DEFAULTS['colorFull']), palette.parseColour(self.values['colorHalf'], DEFAULTS['colorHalf']), palette.parseColour(self.values['colorZero'], DEFAULTS['colorZero']))

    def isToggleKey(self, event):
        # Нажато ли сочетание вкл/выкл из настроек.
        return hotkeyMatches(self.values['toggleKey'], event)


def _number(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _index(value, options, default):
    try:
        idx = int(value)
    except (TypeError, ValueError):
        return default
    if 0 <= idx < len(options):
        return idx
    return default


g_settings = Settings()
