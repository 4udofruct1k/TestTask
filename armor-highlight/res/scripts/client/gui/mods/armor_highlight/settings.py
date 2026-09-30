# -*- coding: utf-8 -*-
# Настройки мода. Окно — через ModsSettingsAPI (izeberg.modssettingsapi), если он установлен;
# он же сохраняет значения между запусками. Без него работают значения по умолчанию.
import Keys

from gui.mods.armor_highlight import log, logException, palette

LINKAGE = 'max.armor_highlight'
# Увеличить при изменении шаблона: ModsSettingsAPI тогда сбросит сохранённые значения на новые по умолчанию.
SETTINGS_VERSION = 6

CELL_SIZES = (1, 2, 4, 8)
# Где подсвечивать: область вокруг центра прицела (каждая ячейка) или вся цель — с уточнением границ
# или каждая ячейка (в фоне, показ целиком / за один кадр, игра замирает).
MODES = ('aim', 'adaptive', 'background', 'blocking')
MODE_LABELS = ['Вокруг центра прицела', 'Вся цель, с уточнением', 'Вся цель, каждая ячейка в фоне', 'Вся цель, каждая ячейка за один кадр']
# Радиус области вокруг центра прицела, px.
AIM_RADII = (40, 60, 80, 120, 160)
# Шаг поиска мелких зон: None — подобрать по размеру цели, иначе уровень сетки (16 px -> 4, ...).
SEARCH_STEPS = (None, 16, 8, 4, 2)
FOCUS_RADII = (0, 10, 20, 40)
COLOUR_MODES = ('texture', 'memory', 'tint255', 'tint1')

DEFAULTS = {'enabled': True,
 'toggleKey': [Keys.KEY_Y],
 'showWhileMoving': True,
 'showInArcade': True,
 'stickyTarget': True,
 'appearDelayMs': 100,
 'mode': 0,
 'aimRadius': 1,
 'cellSize': 0,
 'searchStep': 0,
 'focusRadius': 2,
 'frameBudgetMs': 3,
 'previewBudgetMs': 25,
 'colorFull': palette.DEFAULT_FULL,
 'colorHalf': palette.DEFAULT_HALF,
 'colorZero': palette.DEFAULT_ZERO,
 'gradientSteps': 2,
 'opacity': 50,
 'colourMode': 0}


def _tooltip(header, body):
    return '{HEADER}%s{/HEADER}{BODY}%s{/BODY}' % (header, body)


def _template(templates):
    return {'modDisplayName': 'Подсветка брони',
     'settingsVersion': SETTINGS_VERSION,
     'enabled': DEFAULTS['enabled'],
     'column1': [templates.createLabel('Просмотр на танке в ангаре — пункт «Подсветка брони: просмотр» в списке модов.'),
                 templates.createHotkey('Включить или выключить в бою', 'toggleKey', DEFAULTS['toggleKey'], tooltip=_tooltip('Клавиша подсветки', 'В начале каждого боя подсветка включена. Клавиша выключает и снова включает её до конца боя.')),
                 templates.createCheckbox('Показывать в движении', 'showWhileMoving', DEFAULTS['showWhileMoving'], tooltip=_tooltip('Показывать в движении', 'Если выключено, подсветка появляется, только когда свой танк стоит.')),
                 templates.createCheckbox('Показывать в аркадном режиме', 'showInArcade', DEFAULTS['showInArcade'], tooltip=_tooltip('Аркадный режим', 'Если выключено, подсветка только в снайперском режиме.')),
                 templates.createCheckbox('Не убирать, когда прицел уходит с цели', 'stickyTarget', DEFAULTS['stickyTarget'], tooltip=_tooltip('Держать цель', 'Подсветка остаётся на последней цели, пока прицел не наведён на другого противника, цель жива и видна.')),
                 templates.createDropdown('Где подсвечивать', 'mode', MODE_LABELS, DEFAULTS['mode'], tooltip=_tooltip('Где подсвечивать', '«Вокруг центра прицела» — круг заданного размера, в нём считается каждая ячейка, от центра наружу; нагрузка небольшая. «Вся цель» — для проверки: с уточнением — сначала редкие точки, потом границы цветов; каждая ячейка — вся цель без пропусков, в фоне (бюджет 25 мс на кадр, картинка появляется целиком) или за один кадр (игра замирает на время расчёта).')),
                 templates.createStepSlider('Размер области у прицела', 'aimRadius', [ 'радиус %d px' % radius for radius in AIM_RADII ], DEFAULTS['aimRadius'], tooltip=_tooltip('Размер области', 'Радиус круга вокруг центра прицела. Число точек растёт как квадрат радиуса: вдвое больше радиус — вчетверо дольше прорисовка.')),
                 templates.createSlider('Задержка появления', 'appearDelayMs', DEFAULTS['appearDelayMs'], 0, 1000, 50, '{{value}} мс'),
                 templates.createStepSlider('Размер ячейки', 'cellSize', [ '%d px' % size for size in CELL_SIZES ], DEFAULTS['cellSize'], tooltip=_tooltip('Размер ячейки', 'Мельче — ровнее граница цветов, но дольше прорисовка и больше нагрузка.')),
                 templates.createStepSlider('Шаг поиска мелких зон', 'searchStep', [ 'авто' if step is None else '%d px' % step for step in SEARCH_STEPS ], DEFAULTS['searchStep'], tooltip=_tooltip('Шаг поиска', 'Только для «Вся цель, с уточнением». Сначала цель проверяется точками через этот шаг, потом уточняются границы цветов. Зона меньше шага может потеряться. Мельче шаг — меньше пропусков, но дольше первая картинка. «Авто» — 8–16 px в зависимости от размера цели.')),
                 templates.createStepSlider('Полная проверка под прицелом', 'focusRadius', [ 'выкл' if radius == 0 else 'радиус %d px' % radius for radius in FOCUS_RADII ], DEFAULTS['focusRadius'], tooltip=_tooltip('Под прицелом', 'Только для «Вся цель, с уточнением». В круге вокруг прицела считается каждая ячейка, без пропусков: там найдутся и смотровые щели меньше шага поиска. Эта часть считается первой.')),
                 templates.createSlider('Нагрузка на процессор в бою', 'frameBudgetMs', DEFAULTS['frameBudgetMs'], 1, 10, 1, '{{value}} мс/кадр', tooltip=_tooltip('Бюджет расчёта в бою', 'Сколько миллисекунд каждого кадра мод тратит на расчёт точек. Больше — быстрее прорисовка, но ниже FPS. Расчёт идёт в основном потоке игры: движок проверяет попадание луча в модель только из него, поэтому другие ядра процессора не помогают.')),
                 templates.createSlider('Нагрузка в режиме просмотра', 'previewBudgetMs', DEFAULTS['previewBudgetMs'], 5, 50, 5, '{{value}} мс/кадр', tooltip=_tooltip('Бюджет расчёта в ангаре', 'То же для режима просмотра в ангаре. Там FPS не важен, поэтому по умолчанию бюджет больше и прорисовка быстрее; пока круг заполняется, FPS в ангаре ниже.'))],
     'column2': [templates.createColorChoice('Пробитие 100%', 'colorFull', '#' + DEFAULTS['colorFull']),
                 templates.createColorChoice('Пробитие 50%', 'colorHalf', '#' + DEFAULTS['colorHalf']),
                 templates.createColorChoice('Не пробивает или нет урона', 'colorZero', '#' + DEFAULTS['colorZero']),
                 templates.createStepSlider('Оттенков в переходе', 'gradientSteps', [ str(steps) for steps in palette.GRADIENT_STEPS ], DEFAULTS['gradientSteps'], tooltip=_tooltip('Оттенки', 'Сколько цветов между 100% и 0%. Больше — плавнее переход, но больше границ для уточнения.')),
                 templates.createSlider('Непрозрачность', 'opacity', DEFAULTS['opacity'], 10, 100, 10, '{{value}}%'),
                 templates.createDropdown('Способ окраски', 'colourMode', ['Текстуры из пакета', 'Текстуры в памяти', 'colour 0–255', 'colour 0–1'], DEFAULTS['colourMode'], tooltip=_tooltip('Способ окраски', 'Если цвета в предпросмотре неправильные или квадраты белые, попробуйте другой способ. Текстуры из пакета приводят цвет к ближайшему из палитры.'))]}


class Settings(object):

    def __init__(self):
        self.values = dict(DEFAULTS)
        self.hasApi = False
        self.__api = None
        self.__listeners = []

    def load(self):
        # Регистрация окна настроек. Без ModsSettingsAPI остаются значения по умолчанию.
        try:
            from gui.modsSettingsApi import g_modsSettingsApi, templates
        except ImportError:
            log('ModsSettingsAPI not found, using default settings')
            return

        template = _template(templates)
        saved = g_modsSettingsApi.getModSettings(LINKAGE, template)
        if saved:
            g_modsSettingsApi.registerCallback(LINKAGE, self.__onModSettingsChanged)
        else:
            saved = g_modsSettingsApi.setModTemplate(LINKAGE, template, self.__onModSettingsChanged)
        self.__api = g_modsSettingsApi
        self.hasApi = True
        self.__apply(saved)
        log('settings: %s', self.describe())

    def addListener(self, callback):
        if callback not in self.__listeners:
            self.__listeners.append(callback)

    def removeListener(self, callback):
        if callback in self.__listeners:
            self.__listeners.remove(callback)

    def __onModSettingsChanged(self, linkage, newSettings):
        try:
            if linkage != LINKAGE:
                return
            self.__apply(newSettings)
            log('settings changed: %s', self.describe())
            for callback in list(self.__listeners):
                callback()

        except Exception:
            logException('onModSettingsChanged')

    def __apply(self, saved):
        if not saved:
            return
        for key in DEFAULTS:
            if key in saved:
                self.values[key] = saved[key]

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
    def cellLevel(self):
        # Уровень сетки для размера ячейки: 1 px -> 0, 2 px -> 1, ...
        return _index(self.values['cellSize'], CELL_SIZES, DEFAULTS['cellSize'])

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
        # Нажата ли клавиша вкл/выкл. С ModsSettingsAPI — сочетание из настроек, без него — Y без модификаторов.
        keys = self.values['toggleKey'] or []
        flat = set()
        for key in keys:
            if isinstance(key, (list, tuple)):
                flat.update(key)
            else:
                flat.add(key)

        if event.key not in flat:
            return False
        if self.__api is not None:
            return self.__api.checkKeyset(keys)
        return not (event.isCtrlDown() or event.isAltDown() or event.isShiftDown())


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
