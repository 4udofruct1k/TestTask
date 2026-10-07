# -*- coding: utf-8 -*-
# Хранилище настроек: свой файл settings.json рядом с preferences.xml клиента и окно в «Настройках модификаций»
# (ModsSettingsAPI), если он установлен. Значения всегда пишутся и в свой файл: ничего не теряется, если
# ModsSettingsAPI удалить или поставить. Что хранится и как выглядит окно — схема (Schema): у сборки для Лесты
# и для WG они свои (settings.py, settings_wg.py), хранилище общее.
import json
import os

import BigWorld
import Keys

from gui.mods.armor_highlight import log, logException

_KEY_NAMES = dict(((getattr(Keys, name), name[4:]) for name in dir(Keys) if name.startswith('KEY_') and isinstance(getattr(Keys, name), int)))
_MODIFIER_KEYS = (('ctrl', (Keys.KEY_LCONTROL, Keys.KEY_RCONTROL)), ('alt', (Keys.KEY_LALT, Keys.KEY_RALT)), ('shift', (Keys.KEY_LSHIFT, Keys.KEY_RSHIFT)))
FILE_NAME = 'settings.json'


class Schema(object):
    # linkage — id окна в ModsSettingsAPI; templateVersion — при смене окно берёт значения из шаблона (наши текущие);
    # fileVersion — при смене сохранённые значения заменяются значениями по умолчанию; fileDir — папка рядом
    # с preferences.xml. items — пункты: (ключ, вид, подпись, варианты или (от, до, шаг, единица), подсказка);
    # виды bool, choice (индекс в вариантах), int, colour (hex), hotkey. column2 — ключи второй колонки окна,
    # stepSliders — варианты ползунком, а не списком. label — строка над пунктами окна или None.
    def __init__(self, linkage, title, templateVersion, fileVersion, fileDir, defaults, items, column2=(), stepSliders=(), label=None, noApiMessage='ModsSettingsAPI not found, defaults and %s' % FILE_NAME):
        self.linkage = linkage
        self.title = title
        self.templateVersion = templateVersion
        self.fileVersion = fileVersion
        self.fileDir = fileDir
        self.defaults = defaults
        self.items = items
        self.column2 = frozenset(column2)
        self.stepSliders = frozenset(stepSliders)
        self.label = label
        self.noApiMessage = noApiMessage


def keyName(key):
    return _KEY_NAMES.get(key, str(key))


def hotkeyName(hotkey):
    # «Ctrl+Shift+Y».
    parts = [ label for flag, label in (('ctrl', 'Ctrl'), ('alt', 'Alt'), ('shift', 'Shift')) if hotkey.get(flag) ]
    parts.append(keyName(hotkey.get('key')))
    return '+'.join(parts)


def hotkeyMatches(hotkey, event):
    return event.key == hotkey.get('key') and bool(event.isCtrlDown()) == bool(hotkey.get('ctrl')) and bool(event.isAltDown()) == bool(hotkey.get('alt')) and bool(event.isShiftDown()) == bool(hotkey.get('shift'))


def settingsPath(fileDir):
    # Рядом с preferences.xml клиента, как его кэши (helpers/local_cache.py): туда игра точно может писать.
    # У Лесты — BigWorld.getPreferencesFilePath, у WG 2.4.0.2 — wg_getPreferencesFilePath (account_helpers/persistent_caches.py).
    getter = getattr(BigWorld, 'getPreferencesFilePath', None) or BigWorld.wg_getPreferencesFilePath
    prefs = getter()
    if isinstance(prefs, str):
        prefs = prefs.decode('utf-8', 'replace')
    return os.path.join(os.path.dirname(prefs), fileDir, FILE_NAME)


def hotkeyToApi(hotkey):
    # Формат ModsSettingsAPI: список клавиш, модификатор — список из левой и правой.
    keys = [ list(pair) for flag, pair in _MODIFIER_KEYS if hotkey.get(flag) ]
    keys.append(hotkey.get('key'))
    return keys


def hotkeyFromApi(keys):
    hotkey = {'key': None, 'ctrl': False, 'alt': False, 'shift': False}
    for key in keys or ():
        if isinstance(key, (list, tuple)):
            for flag, pair in _MODIFIER_KEYS:
                if set(key) & set(pair):
                    hotkey[flag] = True

        else:
            modifier = [ flag for flag, pair in _MODIFIER_KEYS if key in pair ]
            if modifier:
                hotkey[modifier[0]] = True
            else:
                hotkey['key'] = key

    return hotkey if isinstance(hotkey['key'], int) else None


def _tooltip(header, body):
    return '{HEADER}%s{/HEADER}{BODY}%s{/BODY}' % (header.encode('utf-8'), body.encode('utf-8'))


def control(templates, schema, item, value):
    # Элемент окна ModsSettingsAPI. Если в установленной версии нет нужного элемента или он падает — вариант
    # попроще, а не пропажа всего окна.
    key, kind, label, options, hint = item
    text = label.encode('utf-8')
    tooltip = _tooltip(label, hint) if hint else None
    try:
        if kind == 'bool':
            return templates.createCheckbox(text, key, bool(value), tooltip=tooltip)
        if kind == 'hotkey':
            return templates.createHotkey(text, key, hotkeyToApi(value), tooltip=tooltip)
        if kind == 'colour':
            return templates.createColorChoice(text, key, '#' + value, tooltip=tooltip)
        if kind == 'int':
            low, high, step, unit = options
            return templates.createSlider(text, key, int(value), low, high, step, '{{value}}' + unit.encode('utf-8'), tooltip=tooltip)
        labels = [ option.encode('utf-8') for option in options ]
        if key in schema.stepSliders:
            return templates.createStepSlider(text, key, labels, int(value), tooltip=tooltip)
        return templates.createDropdown(text, key, labels, int(value), tooltip=tooltip)
    except Exception:
        logException('ModsSettingsAPI template %s' % key)

    if kind == 'choice':
        try:
            return templates.createDropdown(text, key, [ option.encode('utf-8') for option in options ], int(value))
        except Exception:
            logException('ModsSettingsAPI template %s (dropdown)' % key)

    return None


def template(templates, schema, values):
    column1 = []
    column2 = []
    if schema.label:
        try:
            column1.append(templates.createLabel(schema.label.encode('utf-8')))
        except Exception:
            logException('ModsSettingsAPI template label')

    for item in schema.items:
        if item[0] == 'enabled':
            continue
        ctrl = control(templates, schema, item, values[item[0]])
        if ctrl is not None:
            (column2 if item[0] in schema.column2 else column1).append(ctrl)

    return {'modDisplayName': schema.title.encode('utf-8'),
     'settingsVersion': schema.templateVersion,
     'enabled': bool(values.get('enabled', True)),
     'column1': column1,
     'column2': column2}


def fromApi(schema, saved):
    # Значения окна -> наши.
    kinds = dict(((item[0], item[1]) for item in schema.items))
    changes = {}
    for key, value in (saved or {}).iteritems():
        key = str(key)
        kind = kinds.get(key)
        try:
            if kind is None:
                continue
            if kind == 'bool':
                changes[key] = bool(value)
            elif kind == 'hotkey':
                hotkey = hotkeyFromApi(value)
                if hotkey is not None:
                    changes[key] = hotkey
            elif kind == 'colour':
                colour = str(value).lstrip('#').lower()
                if len(colour) == 6:
                    changes[key] = colour
            else:
                changes[key] = int(round(float(value)))
        except (TypeError, ValueError):
            continue

    return changes


def valid(schema, key, value):
    default = schema.defaults[key]
    if isinstance(default, bool):
        return isinstance(value, bool)
    if isinstance(default, dict):
        return isinstance(value, dict) and isinstance(value.get('key'), int)
    if isinstance(default, basestring):
        return isinstance(value, basestring) and len(value) == 6
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def number(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def index(value, options, default):
    # Индекс варианта: в пределах списка, иначе значение по умолчанию.
    try:
        idx = int(value)
    except (TypeError, ValueError):
        return default
    if 0 <= idx < len(options):
        return idx
    return default


class Store(object):

    def __init__(self, schema):
        self.schema = schema
        self.values = dict(schema.defaults)
        self.path = None
        # Окно в ModsSettingsAPI есть.
        self.hasApi = False
        self.__listeners = []

    def load(self):
        schema = self.schema
        self.path = settingsPath(schema.fileDir)
        try:
            if os.path.isfile(self.path):
                with open(self.path, 'rb') as f:
                    data = json.load(f)
                if data.get('version') == schema.fileVersion:
                    for key, value in (data.get('values') or {}).iteritems():
                        key = str(key)
                        if key in schema.defaults and valid(schema, key, value):
                            if isinstance(value, dict):
                                value = dict(((str(k), v) for k, v in value.iteritems()))
                            elif isinstance(value, unicode):
                                value = str(value)
                            self.values[key] = value

        except Exception:
            logException('settings.load')

        try:
            self.__registerApi()
        except Exception:
            logException('ModsSettingsAPI')

        log('settings: %s (%s)', self.describe(), self.path.encode('utf-8'))

    def __registerApi(self):
        schema = self.schema
        try:
            from gui.modsSettingsApi import g_modsSettingsApi, templates
        except ImportError:
            log(schema.noApiMessage)
            return

        tpl = template(templates, schema, self.values)
        saved = g_modsSettingsApi.getModSettings(schema.linkage, tpl)
        if saved:
            g_modsSettingsApi.registerCallback(schema.linkage, self.__onApiChanged)
            # В окне уже есть сохранённые значения: они главнее, свой файл догоняет их.
            self.values.update(fromApi(schema, saved))
            self.save()
        else:
            g_modsSettingsApi.setModTemplate(schema.linkage, tpl, self.__onApiChanged)
        self.hasApi = True
        log('ModsSettingsAPI: settings window registered, %d + %d controls', len(tpl['column1']), len(tpl['column2']))

    def __onApiChanged(self, linkage, newSettings):
        try:
            if linkage == self.schema.linkage:
                self.update(fromApi(self.schema, newSettings))
        except Exception:
            logException('ModsSettingsAPI callback')

    def save(self):
        if self.path is None:
            return
        try:
            folder = os.path.dirname(self.path)
            if not os.path.isdir(folder):
                os.makedirs(folder)
            with open(self.path, 'wb') as f:
                json.dump({'version': self.schema.fileVersion,
                 'values': self.values}, f, indent=1, sort_keys=True)
        except Exception:
            logException('settings.save')

    def update(self, changes):
        # Новые значения: сохранить и сообщить подписчикам.
        for key, value in changes.iteritems():
            if key in self.schema.defaults:
                self.values[key] = value

        self.save()
        log('settings changed: %s', self.describe())
        for callback in list(self.__listeners):
            try:
                callback()
            except Exception:
                logException('settings listener')

    def reset(self):
        self.update(dict(((key, dict(value) if isinstance(value, dict) else value) for key, value in self.schema.defaults.iteritems())))

    def addListener(self, callback):
        if callback not in self.__listeners:
            self.__listeners.append(callback)

    def removeListener(self, callback):
        if callback in self.__listeners:
            self.__listeners.remove(callback)

    def describe(self):
        return ', '.join(('%s=%s' % (key, self.values[key]) for key in sorted(self.values)))

    @property
    def enabled(self):
        return bool(self.values.get('enabled', True))
