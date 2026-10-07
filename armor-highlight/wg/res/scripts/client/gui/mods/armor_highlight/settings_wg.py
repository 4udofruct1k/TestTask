# -*- coding: utf-8 -*-
# Настройки сборки для WG. Подсветку рисует встроенный фонарь брони клиента, мод задаёт ему цвета, размер
# и затухание; плюс панель шансов у прицела. Хранилище — settings_base.py (окно ModsSettingsAPI и свой файл).
from gui.mods.armor_highlight import palette
from gui.mods.armor_highlight.flashlight_params import SPOT_SCALES
from gui.mods.armor_highlight.settings_base import Schema, Store, index

FILE_VERSION = 1
LINKAGE = 'max.armor_highlight'
TEMPLATE_VERSION = 1
FILE_DIR = 'mods_armor_highlight'
_COLUMN2 = ('ownColours', 'colorFull', 'colorHalf', 'colorZero')
_STEP_SLIDERS = ('spotSize',)

DEFAULTS = {'enabled': True,
 'ownColours': True,
 'colorFull': palette.DEFAULT_FULL,
 'colorHalf': palette.DEFAULT_HALF,
 'colorZero': palette.DEFAULT_ZERO,
 'spotSize': 0,
 'distanceFade': False,
 'aimFade': False,
 'showInArcade': True,
 'aimInfo': True}

ITEMS = (('enabled', 'bool', u'Подсветка брони', None, u'Выключено — встроенная подсветка как в игре, панели у прицела нет.'),
 ('spotSize', 'choice', u'Размер пятна', tuple((u'как в игре' if scale == 1.0 else (u'×%g' % scale).replace('.', ',') for scale in SPOT_SCALES)), u'Радиус пятна подсветки и его предел на экране (в игре — 28% окна).'),
 ('distanceFade', 'bool', u'Затухание с дистанции', None, u'Как в игре: с 200 м бледнее, после 300 м подсветки нет. Выключено — видно на любой дистанции.'),
 ('aimFade', 'bool', u'Бледнее при несведённом прицеле', None, u'Как в игре. Выключено — одинаково яркая сразу.'),
 ('showInArcade', 'bool', u'Показывать в аркадном режиме', None, u'В игре — только в снайперском.'),
 ('aimInfo', 'bool', u'Панель шансов у прицела', None, u'Иконка снаряда, полоска и процент пробития в точке прицеливания. С зажатым Alt — все снаряды орудия.'),
 ('ownColours', 'bool', u'Свои цвета', None, u'Вместо цветовой схемы из настроек игры. Прозрачность и заливка — по-прежнему в настройках игры.'),
 ('colorFull', 'colour', u'Цвет: пробьёт', None, u''),
 ('colorHalf', 'colour', u'Цвет: может пробить', None, u''),
 ('colorZero', 'colour', u'Цвет: не пробьёт', None, u'Не пробьёт или нет урона.'))

SCHEMA = Schema(LINKAGE, u'Подсветка брони', TEMPLATE_VERSION, FILE_VERSION, FILE_DIR, DEFAULTS, ITEMS, _COLUMN2, _STEP_SLIDERS, label=u'Подсветку рисует встроенная подсветка брони игры. В игре она по умолчанию выключена: включается в настройках игры, на вкладке прицела. Мод меняет её цвета, размер и затухание.')


class SettingsWG(Store):

    def __init__(self):
        Store.__init__(self, SCHEMA)

    @property
    def ownColours(self):
        return bool(self.values['ownColours'])

    @property
    def spotScale(self):
        return SPOT_SCALES[index(self.values['spotSize'], SPOT_SCALES, DEFAULTS['spotSize'])]

    @property
    def distanceFade(self):
        return bool(self.values['distanceFade'])

    @property
    def aimFade(self):
        return bool(self.values['aimFade'])

    @property
    def showInArcade(self):
        return bool(self.values['showInArcade'])

    @property
    def aimInfo(self):
        return bool(self.values['aimInfo'])

    def colours(self):
        # (пробьёт, может пробить, не пробьёт) как (r, g, b).
        return (palette.parseColour(self.values['colorFull'], DEFAULTS['colorFull']), palette.parseColour(self.values['colorHalf'], DEFAULTS['colorHalf']), palette.parseColour(self.values['colorZero'], DEFAULTS['colorZero']))


g_settings = SettingsWG()
