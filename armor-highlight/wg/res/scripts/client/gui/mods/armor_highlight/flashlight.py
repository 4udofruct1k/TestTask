# -*- coding: utf-8 -*-
# Сборка для WG: подсветку рисует встроенный фонарь брони клиента (armor_flashlight.ArmorFlashlightSingleton,
# gui/armor_flashlight/battle_controller.py, WG 2.4.0.2). Мод подменяет у его контроллера два метода:
#   _setSettings — свои цвета, размер пятна, без затухания с дистанции и при несведённом прицеле;
#   _onCrosshairViewChanged — подписка на маркер и в аркадном режиме, если он включён в настройках.
# Расчёт пробития, цель, видимость и клавиша вкл/выкл остаются игровыми. Где сервер функцию отключил
# (config.isFeatureEnabled, ARENA_BONUS_TYPE_CAPS.AFL_ENABLED), контроллер не запускается и мод ничего не делает.
import weakref

import Math
from account_helpers.settings_core.settings_constants import GRAPHICS, ArmorFlashlight
from aih_constants import CTRL_MODE_NAME
from gui.armor_flashlight import battle_controller
from gui.armor_flashlight.config import getConfig
from gui.battle_control.battle_constants import CROSSHAIR_VIEW_ID

from gui.mods.armor_highlight import log, logException
from gui.mods.armor_highlight import flashlight_params as params

_Controller = battle_controller.ArmorFlashlightBattleController
# Исходные методы и значения клиента: восстанавливаются при выключении мода в окне настроек.
_original = {}
_settings = None
# Живой контроллер боя: при смене настроек фонарь перенастраивается сразу, а не со следующего боя.
_live = None


def install(settings):
    global _settings
    _settings = settings
    if _original:
        return
    # Из __dict__ класса — сами функции: при выгрузке на место встаёт ровно то, что было.
    _original['_setSettings'] = _Controller.__dict__['_setSettings']
    _original['_onCrosshairViewChanged'] = _Controller.__dict__['_onCrosshairViewChanged']
    _original['VALID_CTRL_MODES'] = battle_controller.VALID_CTRL_MODES
    _Controller._setSettings = _setSettings
    _Controller._onCrosshairViewChanged = _onCrosshairViewChanged
    settings.addListener(_onSettingsChanged)
    _applyModes()
    log('armor flashlight: controller patched')


def uninstall():
    if not _original:
        return
    _Controller._setSettings = _original.pop('_setSettings')
    _Controller._onCrosshairViewChanged = _original.pop('_onCrosshairViewChanged')
    battle_controller.VALID_CTRL_MODES = _original.pop('VALID_CTRL_MODES')
    _restoreConfig()
    if _settings is not None:
        _settings.removeListener(_onSettingsChanged)


def _active():
    return _settings is not None and _settings.enabled


def _arcade():
    return _active() and _settings.showInArcade


def _applyModes():
    # Режимы управления, в которых фонарь работает: в игре — снайперские; модуль читает список при каждой проверке.
    base = _original['VALID_CTRL_MODES']
    if _arcade() and CTRL_MODE_NAME.ARCADE not in base:
        battle_controller.VALID_CTRL_MODES = tuple(base) + (CTRL_MODE_NAME.ARCADE,)
    else:
        battle_controller.VALID_CTRL_MODES = base


def _rememberConfig(config):
    if 'fadeoffFactorWhenNotAimed' not in _original:
        _original['fadeoffFactorWhenNotAimed'] = config.fadeoffFactorWhenNotAimed


def _restoreConfig():
    if 'fadeoffFactorWhenNotAimed' in _original:
        getConfig().fadeoffFactorWhenNotAimed = _original.pop('fadeoffFactorWhenNotAimed')


def _setSettings(self):
    global _live
    _live = weakref.ref(self)
    if not _active():
        _restoreConfig()
        return _original['_setSettings'](self)
    try:
        config = getConfig()
        _rememberConfig(config)
        # Читается в _setShootingParams каждый кадр: (сведение / разброс) ** factor.
        config.fadeoffFactorWhenNotAimed = params.fadeoffFactor(_original['fadeoffFactorWhenNotAimed'], _settings.aimFade)
        core = self.settingsCore
        if _settings.ownColours:
            colours = tuple((Math.Vector4(*rgba) for rgba in params.colourFloats(*_settings.colours())))
        else:
            colours = config.getSchemaColorFloatsByIndex(core.getSetting(ArmorFlashlight.COLOR_SCHEMA), core.getSetting(GRAPHICS.COLOR_BLIND))
        scale = _settings.spotScale
        # Порядок аргументов — как в battle_controller._setSettings клиента.
        self._armorFlashlightSingleton.setSettings(core.getSetting(ArmorFlashlight.OPACITY), colours, config.getPatternByIndex(core.getSetting(ArmorFlashlight.FILL)), config.textureTilingFactor, params.alphaByDist(config.getDistanceConfigTupleList(config.alphaByDist), _settings.distanceFade), params.scaled(config.getDistanceConfigTupleList(config.radiusByDist), scale), config.getDistanceConfigTupleList(config.appearanceDurationByDist), config.noiseIntensityMultiplier, config.getResolutionDownscaleByIndex(core.getSetting(ArmorFlashlight.RESOLUTION)), params.maxSizePercent(config.maxSizePercentOfWindow, scale), config.borderSmoothness, config.aimingCircleAdjustment * scale, config.smoothnessInAimingCircleAdjustment)
    except Exception:
        logException('armor flashlight settings')
        _restoreConfig()
        _original['_setSettings'](self)


def _onCrosshairViewChanged(self, viewID):
    # Игра подписывается на маркер орудия только в снайперском виде; в аркадном — так же, если включено.
    if _arcade() and viewID == CROSSHAIR_VIEW_ID.ARCADE:
        viewID = CROSSHAIR_VIEW_ID.SNIPER
    return _original['_onCrosshairViewChanged'](self, viewID)


def _onSettingsChanged():
    try:
        _applyModes()
        ctrl = _live() if _live is not None else None
        if ctrl is None or getattr(ctrl, '_armorFlashlightSingleton', None) is None:
            return
        ctrl._setSettings()
        crosshair = ctrl.sessionProvider.shared.crosshair
        if crosshair is not None:
            ctrl._onCrosshairViewChanged(crosshair.getViewID())
    except Exception:
        logException('armor flashlight: settings changed')
